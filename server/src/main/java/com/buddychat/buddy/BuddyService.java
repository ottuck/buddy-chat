package com.buddychat.buddy;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.buddychat.chat.ChatService;
import com.buddychat.chat.Message;
import com.buddychat.common.ApiException;
import com.buddychat.realtime.RoomHub;
import com.buddychat.realtime.ServerEvent;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Buddy care and growth. The buddy is a sub-document of its room, and this service owns the
 * {@code buddy.*} fields of the {@code rooms} collection. Every change is one conditional update,
 * so two members pressing Feed at once feed it once.
 *
 * <p>Changes are announced to the room here: the timeline event as a message, the new state as a
 * {@code buddy} event.
 */
@Service
public class BuddyService {

    private static final String ROOMS = "rooms";
    private static final FindAndModifyOptions RETURN_NEW =
            FindAndModifyOptions.options().returnNew(true);

    // The part of a room document this service reads.
    record RoomBuddy(@Id String id, Buddy buddy) {}

    public record CareResult(BuddyView buddy, boolean changed) {}

    private final ReactiveMongoTemplate mongo;
    private final ChatService chatService;
    private final RoomHub hub;
    private final Clock clock;

    BuddyService(
            ReactiveMongoTemplate mongo,
            ChatService chatService,
            RoomHub hub,
            Clock clock,
            BuddyProperties properties) {
        BuddyRules.useExpPerLevel(properties.expPerLevel());
        BuddyRules.useTiming(properties.fullToEmpty(), properties.poopEvery());
        this.mongo = mongo;
        this.chatService = chatService;
        this.hub = hub;
        this.clock = clock;
    }

    /**
     * The buddy as of now. Hunger and poops that happened since anyone last looked are added to the
     * timeline here (once each: their keys come from the timestamps they follow from), so there is
     * no scheduler. They show up when someone opens the app.
     */
    public Mono<BuddyView> observe(String roomId) {
        Instant now = Instant.now(clock);
        return load(roomId).flatMap(buddy -> {
            List<Mono<Message>> noticed = new ArrayList<>();
            if (BuddyRules.isHungry(buddy, now)) {
                noticed.add(chatService.recordBuddyEvent(
                        roomId, "HUNGRY", null, "buddy:hungry:" + buddy.fedAt().toEpochMilli()));
            }
            // Keyed by the poop's number in this cycle: one tapped away is not noticed again.
            for (int i = 1; i <= BuddyRules.poopsMade(buddy, now); i++) {
                noticed.add(chatService.recordBuddyEvent(
                        roomId,
                        "POOPED",
                        null,
                        "buddy:poop:" + buddy.cleanedAt().toEpochMilli() + ":" + i));
            }
            BuddyView view = BuddyView.of(buddy, now);
            // Newly noticed: the others see the event and, with it, the poop on the floor.
            return Flux.concat(noticed)
                    .doOnNext(message -> hub.publish(roomId, new ServerEvent.NewMessage(message), null))
                    .count()
                    .doOnNext(count -> {
                        if (count > 0) hub.publish(roomId, new ServerEvent.BuddyUpdated(view), null);
                    })
                    .thenReturn(view);
        });
    }

    public Mono<CareResult> feed(String roomId, String actorId) {
        Instant now = Instant.now(clock);
        return care(
                roomId,
                actorId,
                orMissing("buddy.lastFedAt", where("buddy.lastFedAt").lt(BuddyRules.feedableIfFedBefore(now))),
                new Update().set("buddy.lastFedAt", now).inc("buddy.exp", BuddyRules.FEED_EXP),
                "FED",
                BuddyRules.FEED_EXP,
                now);
    }

    /** Cleans up one poop (a tap on it). EXP per poop; the last one leaves CLEANED in the timeline. */
    public Mono<CareResult> clean(String roomId, String actorId) {
        return cleanUp(roomId, actorId, false);
    }

    /** Cleans up every poop at once ("청소" in the chat). */
    public Mono<CareResult> cleanAll(String roomId, String actorId) {
        return cleanUp(roomId, actorId, true);
    }

    /**
     * Compare-and-set on the cleaning state just read: of two taps on the same poop at once, one
     * cleans it and the other gets {@code changed: false}. A clean floor starts a new cycle (the
     * clean time moves to now), so poops are counted from there again.
     */
    private Mono<CareResult> cleanUp(String roomId, String actorId, boolean all) {
        Instant now = Instant.now(clock);
        return load(roomId).flatMap(buddy -> {
            int poops = BuddyRules.poops(buddy, now);
            if (poops == 0) return Mono.just(new CareResult(BuddyView.of(buddy, now), false));
            int removed = all ? poops : 1;
            boolean floorClean = removed == poops;
            Update update = floorClean
                    ? new Update().set("buddy.lastCleanedAt", now).set("buddy.poopsCleaned", 0)
                    : new Update().set("buddy.poopsCleaned", buddy.cleaned() + removed);
            int gain = removed * BuddyRules.CLEAN_EXP;
            Query unchanged = query(where("_id").is(roomId))
                    .addCriteria(sameOrMissing("buddy.lastCleanedAt", buddy.lastCleanedAt()))
                    .addCriteria(sameOrMissing("buddy.poopsCleaned", buddy.poopsCleaned()));
            return mongo.findAndModify(unchanged, update.inc("buddy.exp", gain), RETURN_NEW, RoomBuddy.class, ROOMS)
                    .flatMap(updated -> (floorClean
                                    ? chatService
                                            .recordBuddyEvent(
                                                    roomId, "CLEANED", actorId, "buddy:CLEANED:" + UUID.randomUUID())
                                            .doOnNext(message ->
                                                    hub.publish(roomId, new ServerEvent.NewMessage(message), null))
                                    : Mono.<Message>empty())
                            .then(grown(roomId, updated.buddy(), gain, now))
                            .map(view -> new CareResult(view, true)))
                    .switchIfEmpty(Mono.defer(() ->
                            load(roomId).map(current -> new CareResult(BuddyView.of(current, now), false))));
        });
    }

    // Growth events happen once per buddy: the key names the buddy by its birth, so the next egg
    // evolves and levels up again in the timeline.
    private static String eventKey(Buddy buddy, String what) {
        return "buddy:" + buddy.bornAt().toEpochMilli() + ":" + what;
    }

    /**
     * The grown buddy goes its own way (docs/product.md, 독립과 앨범): it is kept in the room's album
     * and a new egg takes its place, in one update so neither happens without the other. Only at
     * the top level; of two members doing it at once, one does (the other gets BUDDY_NOT_GROWN, as
     * there is only an egg now).
     */
    public Mono<BuddyView> graduate(String roomId, String actorId, String newName) {
        Instant now = Instant.now(clock);
        return load(roomId).flatMap(buddy -> {
            if (BuddyRules.level(buddy.exp()) < BuddyRules.MAX_LEVEL) return Mono.error(notGrown());
            // Still this buddy, still grown: a new egg (EXP 0) never matches, even if born the same moment.
            Query same = query(where("_id")
                    .is(roomId)
                    .and("buddy.bornAt")
                    .is(buddy.bornAt())
                    .and("buddy.exp")
                    .gte(BuddyRules.minExp(BuddyRules.MAX_LEVEL)));
            Update update = new Update()
                    .push("album", new AlbumEntry(buddy.name(), buddy.bornAt(), now))
                    .set("buddy", buddy.next(newName, now));
            return mongo.findAndModify(same, update, RETURN_NEW, RoomBuddy.class, ROOMS)
                    .switchIfEmpty(Mono.error(notGrown()))
                    .flatMap(updated -> chatService
                            .recordBuddyEvent(roomId, "GRADUATED", buddy.name(), actorId, eventKey(buddy, "graduated"))
                            .doOnNext(message -> hub.publish(roomId, new ServerEvent.NewMessage(message), null))
                            .then(Mono.fromSupplier(() -> {
                                BuddyView view = BuddyView.of(updated.buddy(), now);
                                hub.publish(roomId, new ServerEvent.BuddyUpdated(view), null);
                                return view;
                            })));
        });
    }

    private static ApiException notGrown() {
        return new ApiException(HttpStatus.CONFLICT, "BUDDY_NOT_GROWN");
    }

    // The field as read: that value, or still absent.
    private static Criteria sameOrMissing(String field, @Nullable Object value) {
        return value == null ? where(field).exists(false) : where(field).is(value);
    }

    /**
     * After a text message: +1 EXP, and if the whole message is a care word ("밥", "🧹", …, see
     * {@link CareCommand}), the sender feeds or cleans as with the buttons. Not needed right now
     * (not hungry, no poop) is fine: the message is just a message.
     */
    public Mono<Void> onMessageSent(String roomId, String senderId, String text) {
        Mono<?> care = CareCommand.of(text)
                .map(command -> command == CareCommand.FEED ? feed(roomId, senderId) : cleanAll(roomId, senderId))
                .orElse(Mono.empty());
        return onMessageSent(roomId).then(talked(roomId, senderId)).then(care).then();
    }

    /**
     * Notes that the sender talked today (docs/product.md, 둘이 함께). The first time both members
     * have, the buddy gets {@link BuddyRules#TOGETHER_EXP} once for the day and the timeline a
     * TOGETHER entry. A member's first message of the day otherwise just updates everyone's view, so
     * the other one sees they are awaited. Later messages that day change nothing.
     */
    public Mono<Void> talked(String roomId, String senderId) {
        Instant now = Instant.now(clock);
        String today = BuddyRules.day(now);
        // Both return the buddy as it was, to tell whether the sender is new today.
        Mono<RoomBuddy> sameDay = Mono.defer(() -> mongo.findAndModify(
                query(where("_id").is(roomId).and("buddy.talkDay").is(today)),
                new Update().addToSet("buddy.talkers", senderId),
                RoomBuddy.class,
                ROOMS));
        // The day's first message starts the list. If another message won that race, join the day
        // it just started.
        Mono<RoomBuddy> newDay = Mono.defer(() -> mongo.findAndModify(
                query(where("_id").is(roomId).and("buddy.talkDay").ne(today)),
                new Update().set("buddy.talkDay", today).set("buddy.talkers", List.of(senderId)),
                RoomBuddy.class,
                ROOMS));
        return sameDay.switchIfEmpty(newDay)
                .switchIfEmpty(sameDay)
                .filter(before -> !before.buddy().talkedOn(today).contains(senderId))
                .flatMap(before -> together(roomId, today, now)
                        .switchIfEmpty(Mono.defer(() -> load(roomId).map(buddy -> {
                            BuddyView view = BuddyView.of(buddy, now);
                            hub.publish(roomId, new ServerEvent.BuddyUpdated(view), null);
                            return view;
                        }))))
                .then();
    }

    // Both have talked today and the bonus is not given yet: give it. One conditional update, so
    // two first messages at once give it once.
    private Mono<BuddyView> together(String roomId, String today, Instant now) {
        Query bothTalked = query(where("_id")
                .is(roomId)
                .and("buddy.talkDay")
                .is(today)
                .and("buddy.talkers.1")
                .exists(true)
                .and("buddy.togetherDay")
                .ne(today));
        Update bonus = new Update().set("buddy.togetherDay", today).inc("buddy.exp", BuddyRules.TOGETHER_EXP);
        return mongo.findAndModify(bothTalked, bonus, RETURN_NEW, RoomBuddy.class, ROOMS)
                .flatMap(updated -> chatService
                        .recordBuddyEvent(
                                roomId,
                                "TOGETHER",
                                String.valueOf(BuddyRules.TOGETHER_EXP),
                                null,
                                eventKey(updated.buddy(), "together:" + today))
                        .doOnNext(message -> hub.publish(roomId, new ServerEvent.NewMessage(message), null))
                        .then(grown(roomId, updated.buddy(), BuddyRules.TOGETHER_EXP, now)));
    }

    /**
     * +1 EXP for a sent message, at most {@link BuddyRules#MESSAGE_EXP_DAILY_CAP} a day per room.
     * Both updates are conditional, so the cap holds under concurrent sends.
     */
    public Mono<Void> onMessageSent(String roomId) {
        Instant now = Instant.now(clock);
        String today = BuddyRules.day(now);
        Mono<RoomBuddy> sameDay = Mono.defer(() -> mongo.findAndModify(
                query(where("_id")
                        .is(roomId)
                        .and("buddy.expDay")
                        .is(today)
                        .and("buddy.messageExpToday")
                        .lt(BuddyRules.MESSAGE_EXP_DAILY_CAP)),
                new Update().inc("buddy.exp", BuddyRules.MESSAGE_EXP).inc("buddy.messageExpToday", 1),
                RETURN_NEW,
                RoomBuddy.class,
                ROOMS));
        // First message of the day starts the count. If another message won that race, count
        // this one against the day it just started.
        Mono<RoomBuddy> newDay = Mono.defer(() -> mongo.findAndModify(
                query(where("_id").is(roomId).and("buddy.expDay").ne(today)),
                new Update()
                        .set("buddy.expDay", today)
                        .set("buddy.messageExpToday", 1)
                        .inc("buddy.exp", BuddyRules.MESSAGE_EXP),
                RETURN_NEW,
                RoomBuddy.class,
                ROOMS));
        return sameDay.switchIfEmpty(newDay)
                .switchIfEmpty(sameDay)
                .flatMap(updated -> grown(roomId, updated.buddy(), BuddyRules.MESSAGE_EXP, now))
                .then();
    }

    private Mono<CareResult> care(
            String roomId, String actorId, Criteria allowed, Update update, String event, int gain, Instant now) {
        Query query = query(where("_id").is(roomId)).addCriteria(allowed);
        return mongo.findAndModify(query, update, RETURN_NEW, RoomBuddy.class, ROOMS)
                .flatMap(updated -> chatService
                        .recordBuddyEvent(roomId, event, actorId, "buddy:" + event + ":" + UUID.randomUUID())
                        .doOnNext(message -> hub.publish(roomId, new ServerEvent.NewMessage(message), null))
                        .then(grown(roomId, updated.buddy(), gain, now))
                        .map(view -> new CareResult(view, true)))
                // Not needed (or someone else just did it): report the current state unchanged.
                .switchIfEmpty(Mono.defer(() ->
                        load(roomId).map(buddy -> new CareResult(BuddyView.of(buddy, now), false))));
    }

    // After EXP went up by `gain`: celebrate an evolution, or else a new level, then send everyone the
    // new state. An evolution is a level-up too; one line in the timeline is enough for it.
    private Mono<BuddyView> grown(String roomId, Buddy after, int gain, Instant now) {
        int levelBefore = BuddyRules.level(after.exp() - gain);
        int level = BuddyRules.level(after.exp());
        BuddyRules.Stage stage = BuddyRules.stage(level);
        Mono<Message> event;
        if (stage != BuddyRules.stage(levelBefore)) {
            event = chatService.recordBuddyEvent(roomId, "EVOLVED", null, eventKey(after, "evolved:" + stage));
        } else if (level == BuddyRules.MAX_LEVEL && levelBefore < level) {
            // The top: a thank-you in the timeline instead of one more level.
            event = chatService.recordBuddyEvent(
                    roomId,
                    "MAX_LEVEL",
                    String.valueOf(level),
                    null,
                    eventKey(after, "max:" + BuddyRules.expPerLevel()));
        } else if (level > levelBefore) {
            // Keyed by the level and the EXP per level: the same level reached again under another
            // setting is a new event.
            event = chatService.recordBuddyEvent(
                    roomId,
                    "LEVELED_UP",
                    String.valueOf(level),
                    null,
                    eventKey(after, "level:" + BuddyRules.expPerLevel() + ":" + level));
        } else {
            event = Mono.empty();
        }
        BuddyView view = BuddyView.of(after, now);
        return event.doOnNext(message -> hub.publish(roomId, new ServerEvent.NewMessage(message), null))
                .then(Mono.fromRunnable(() -> hub.publish(roomId, new ServerEvent.BuddyUpdated(view), null)))
                .thenReturn(view);
    }

    private Mono<Buddy> load(String roomId) {
        return mongo.findById(roomId, RoomBuddy.class, ROOMS)
                .map(RoomBuddy::buddy)
                .switchIfEmpty(Mono.error(new ApiException(HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND")));
    }

    // Rooms created before care existed have no timestamp yet; they count as ready for care.
    private static Criteria orMissing(String field, Criteria condition) {
        return new Criteria().orOperator(condition, where(field).exists(false));
    }
}
