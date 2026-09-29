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
            for (int i = 1; i <= BuddyRules.poops(buddy, now); i++) {
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

    public Mono<CareResult> clean(String roomId, String actorId) {
        Instant now = Instant.now(clock);
        return care(
                roomId,
                actorId,
                orMissing(
                        "buddy.lastCleanedAt",
                        where("buddy.lastCleanedAt").lte(BuddyRules.cleanableIfCleanedBefore(now))),
                new Update().set("buddy.lastCleanedAt", now).inc("buddy.exp", BuddyRules.CLEAN_EXP),
                "CLEANED",
                BuddyRules.CLEAN_EXP,
                now);
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

    // After EXP went up by `gain`: celebrate an evolution, then send everyone the new state.
    private Mono<BuddyView> grown(String roomId, Buddy after, int gain, Instant now) {
        BuddyRules.Stage before = BuddyRules.stage(BuddyRules.level(after.exp() - gain));
        BuddyRules.Stage stage = BuddyRules.stage(BuddyRules.level(after.exp()));
        Mono<Message> evolved = stage == before
                ? Mono.empty()
                : chatService.recordBuddyEvent(roomId, "EVOLVED", null, "buddy:evolved:" + stage);
        BuddyView view = BuddyView.of(after, now);
        return evolved.doOnNext(message -> hub.publish(roomId, new ServerEvent.NewMessage(message), null))
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
