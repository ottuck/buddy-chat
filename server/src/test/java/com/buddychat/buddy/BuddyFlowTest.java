package com.buddychat.buddy;

import static com.buddychat.TestJwtConfiguration.token;
import static org.assertj.core.api.Assertions.assertThat;

import com.buddychat.MutableClock;
import com.buddychat.TestJwtConfiguration;
import com.buddychat.TestSocket;
import com.buddychat.TestcontainersConfiguration;
import com.buddychat.chat.Message;
import com.buddychat.room.Invitation;
import com.buddychat.room.Room;
import com.buddychat.room.RoomView;
import com.buddychat.user.User;
import com.buddychat.user.UserService;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({TestcontainersConfiguration.class, TestJwtConfiguration.class, MutableClock.Config.class})
class BuddyFlowTest {

    @LocalServerPort
    int port;

    @Autowired
    MutableClock clock;

    @Autowired
    ReactiveMongoTemplate mongo;

    @Autowired
    BuddyService buddyService;

    @Autowired
    JsonMapper json;

    @Autowired
    UserService userService;

    @Autowired
    BuddyExpScale expScale;

    private WebTestClient http;
    private final List<TestSocket> sockets = new ArrayList<>();

    record Care(BuddyView buddy, boolean changed) {}

    @BeforeEach
    void setUp() {
        clock.reset();
        Flux.just(Room.class, Invitation.class, User.class, Message.class)
                .flatMap(type -> mongo.remove(new Query(), type))
                .blockLast();
        http = WebTestClient.bindToServer()
                .baseUrl("http://localhost:" + port)
                .responseTimeout(Duration.ofSeconds(20))
                .build();
    }

    @AfterEach
    void closeSockets() {
        sockets.forEach(TestSocket::close);
    }

    @Test
    void newBuddyIsAFullCleanEgg() {
        BuddyView buddy = createRoom("henry").buddy();

        assertThat(buddy.stage()).isEqualTo(BuddyRules.Stage.EGG);
        assertThat(buddy.level()).isEqualTo(1);
        assertThat(buddy.fullness()).isEqualTo(100);
        assertThat(buddy.poops()).isZero();
        assertThat(buddy.canFeed()).isFalse();
        assertThat(buddy.canClean()).isFalse();
    }

    @Test
    void feedingANotHungryBuddyChangesNothing() {
        createRoom("henry");

        Care care = care("henry", "feed");

        assertThat(care.changed()).isFalse();
        assertThat(care.buddy().exp()).isZero();
        assertThat(timeline("henry")).isEmpty();
    }

    @Test
    void getsHungryOverTimeAndIsNoticedOnce() {
        createRoom("henry");
        clock.advance(BuddyRules.hungryAfter());

        BuddyView buddy = room("henry").buddy();
        room("henry"); // looking again does not repeat the event

        assertThat(buddy.hungry()).isTrue();
        assertThat(buddy.canFeed()).isTrue();
        assertThat(buddy.fullness()).isLessThanOrEqualTo(30);
        // Poops came meanwhile too, each once.
        long poops = Math.min(3, BuddyRules.hungryAfter().dividedBy(BuddyRules.poopEvery()));
        assertThat(timeline("henry")).containsOnlyOnce("HUNGRY");
        assertThat(timeline("henry")).filteredOn("POOPED"::equals).hasSize((int) poops);
    }

    @Test
    void feedingRestoresFullnessGivesExpAndLeavesATimelineEvent() {
        createRoom("henry");
        clock.advance(BuddyRules.hungryAfter());

        Care care = care("henry", "feed");

        assertThat(care.changed()).isTrue();
        assertThat(care.buddy().fullness()).isEqualTo(100);
        assertThat(care.buddy().exp()).isEqualTo(BuddyRules.FEED_EXP);
        assertThat(timeline("henry")).containsExactly("FED");
    }

    @Test
    void bothMembersFeedingAtOnceFeedsItOnce() {
        duoRoom("henry", "yuki");
        clock.advance(BuddyRules.hungryAfter());

        List<Boolean> changed =
                race(8, i -> care(i % 2 == 0 ? "henry" : "yuki", "feed").changed());

        assertThat(changed).containsOnlyOnce(true);
        assertThat(room("henry").buddy().exp()).isEqualTo(BuddyRules.FEED_EXP);
        assertThat(timeline("henry")).containsOnlyOnce("FED");
    }

    @Test
    void eachTapCleansOnePoopAndTheLastLeavesOneLine() {
        duoRoom("henry", "yuki");
        clock.advance(BuddyRules.poopEvery().multipliedBy(2).plusMinutes(1)); // two poops
        assertThat(room("henry").buddy().poops()).isEqualTo(2);

        Care first = care("henry", "clean");
        room("henry"); // looking again does not bring the cleaned poop back
        Care second = care("yuki", "clean");
        Care third = care("henry", "clean");

        assertThat(first.changed()).isTrue();
        assertThat(first.buddy().poops()).isEqualTo(1);
        assertThat(second.changed()).isTrue();
        assertThat(second.buddy().poops()).isZero();
        assertThat(third.changed()).isFalse();
        assertThat(room("henry").buddy().exp()).isEqualTo(2 * BuddyRules.CLEAN_EXP);
        assertThat(timeline("henry")).filteredOn("POOPED"::equals).hasSize(2);
        assertThat(timeline("henry")).containsOnlyOnce("CLEANED");

        // A clean floor starts over: the next poop comes a full period later.
        clock.advance(BuddyRules.poopEvery().minusMinutes(1));
        assertThat(room("henry").buddy().poops()).isZero();
        clock.advance(Duration.ofMinutes(2));
        assertThat(room("henry").buddy().poops()).isEqualTo(1);
    }

    @Test
    void tapsOnTheSamePoopAtOnceCleanItOnce() {
        duoRoom("henry", "yuki");
        clock.advance(BuddyRules.poopEvery().plusMinutes(1)); // one poop

        List<Boolean> changed =
                race(6, i -> care(i % 2 == 0 ? "henry" : "yuki", "clean").changed());

        assertThat(changed).containsOnlyOnce(true);
        assertThat(room("henry").buddy().exp()).isEqualTo(BuddyRules.CLEAN_EXP);
    }

    @Test
    void theTopLevelSaysThanksOnceAndStaysThere() {
        String roomId = createRoom("henry").id();
        int almost = (BuddyRules.MAX_LEVEL - 1) * BuddyRules.expPerLevel() - 1;
        mongo.updateFirst(
                        Query.query(Criteria.where("_id").is(new ObjectId(roomId))),
                        new Update().set("buddy.exp", almost),
                        "rooms")
                .block();

        buddyService.onMessageSent(roomId).block();
        buddyService.onMessageSent(roomId).block();

        BuddyView buddy = room("henry").buddy();
        assertThat(buddy.level()).isEqualTo(BuddyRules.MAX_LEVEL);
        assertThat(buddy.levelProgress()).isEqualTo(1.0);
        assertThat(timeline("henry")).containsExactly("MAX_LEVEL");
    }

    @Test
    void messageExpIsCappedPerDayEvenWhenSentConcurrently() {
        String roomId = createRoom("henry").id();

        race(
                BuddyRules.MESSAGE_EXP_DAILY_CAP + 15,
                i -> buddyService.onMessageSent(roomId).thenReturn(true).block());
        assertThat(room("henry").buddy().exp()).isEqualTo(BuddyRules.MESSAGE_EXP_DAILY_CAP);

        clock.advance(Duration.ofDays(1));
        buddyService.onMessageSent(roomId).block();
        assertThat(room("henry").buddy().exp()).isEqualTo(BuddyRules.MESSAGE_EXP_DAILY_CAP + 1);
    }

    @Test
    void hatchesWhenReachingTheBabyStage() {
        String roomId = createRoom("henry").id();
        setExp(roomId, BuddyRules.minExp(BuddyRules.BABY_AT) - 1);
        assertThat(room("henry").buddy().stage()).isEqualTo(BuddyRules.Stage.EGG);

        buddyService.onMessageSent(roomId).block();

        BuddyView buddy = room("henry").buddy();
        assertThat(buddy.level()).isEqualTo(BuddyRules.BABY_AT);
        assertThat(buddy.stage()).isEqualTo(BuddyRules.Stage.BABY);
        assertThat(timeline("henry")).containsExactly("EVOLVED");
    }

    @Test
    void stagesComeAtTheirLevels() {
        assertThat(BuddyRules.stage(BuddyRules.BABY_AT - 1)).isEqualTo(BuddyRules.Stage.EGG);
        assertThat(BuddyRules.stage(BuddyRules.CHILD_AT - 1)).isEqualTo(BuddyRules.Stage.BABY);
        assertThat(BuddyRules.stage(BuddyRules.CHILD_AT)).isEqualTo(BuddyRules.Stage.CHILD);
        assertThat(BuddyRules.stage(BuddyRules.ADULT_AT - 1)).isEqualTo(BuddyRules.Stage.CHILD);
        assertThat(BuddyRules.stage(BuddyRules.ADULT_AT)).isEqualTo(BuddyRules.Stage.ADULT);
    }

    @Test
    void aNewLevelIsInTheTimelineButAnEvolutionIsOneLine() {
        String roomId = createRoom("henry").id();

        // Level 2 (still an egg), then level 3 (hatching, an evolution).
        for (int i = 0; i < 2 * BuddyRules.expPerLevel(); i++)
            buddyService.onMessageSent(roomId).block();

        assertThat(timeline("henry")).containsExactly("LEVELED_UP", "EVOLVED");
        JsonNode levelUp = http.get()
                .uri("/api/rooms/me/messages?limit=2")
                .header("Authorization", "Bearer " + token("henry"))
                .exchange()
                .expectBody(JsonNode.class)
                .returnResult()
                .getResponseBody()
                .get("messages")
                .get(1);
        assertThat(levelUp.get("text").asString()).isEqualTo("2");
    }

    @Test
    void bothTalkingOnTheSameDayGivesTheBonusOnceADay() {
        duoRoom("henry", "yuki");
        RoomView room = room("henry");
        String henry = room.members().get(0).id();
        String yuki = room.members().get(1).id();

        buddyService.talked(room.id(), henry).block();
        buddyService.talked(room.id(), henry).block();
        BuddyView alone = room("yuki").buddy();
        assertThat(alone.talkedToday()).containsExactly(henry);
        assertThat(alone.togetherToday()).isFalse();
        assertThat(alone.exp()).isZero();

        buddyService.talked(room.id(), yuki).block();
        buddyService.talked(room.id(), yuki).block();
        BuddyView both = room("henry").buddy();
        assertThat(both.talkedToday()).containsExactlyInAnyOrder(henry, yuki);
        assertThat(both.togetherToday()).isTrue();
        assertThat(both.exp()).isEqualTo(BuddyRules.TOGETHER_EXP);
        assertThat(timeline("henry")).containsOnlyOnce("TOGETHER");

        // A new day starts over.
        clock.advance(Duration.ofDays(1));
        BuddyView nextDay = room("henry").buddy();
        assertThat(nextDay.talkedToday()).isEmpty();
        assertThat(nextDay.togetherToday()).isFalse();
        buddyService.talked(room.id(), yuki).block();
        buddyService.talked(room.id(), henry).block();
        assertThat(room("henry").buddy().exp()).isEqualTo(2 * BuddyRules.TOGETHER_EXP);
        assertThat(timeline("henry")).filteredOn("TOGETHER"::equals).hasSize(2);
    }

    @Test
    void bothFirstMessagesAtOnceGiveTheBonusOnce() {
        duoRoom("henry", "yuki");
        RoomView room = room("henry");
        List<String> members =
                room.members().stream().map(RoomView.Member::id).toList();

        race(10, i -> buddyService.talked(room.id(), members.get(i % 2)).thenReturn(true).block());

        assertThat(room("henry").buddy().exp()).isEqualTo(BuddyRules.TOGETHER_EXP);
        assertThat(timeline("henry")).containsOnlyOnce("TOGETHER");
    }

    @Test
    void talkingAloneGivesNoBonus() {
        String roomId = createRoom("henry").id();
        String henry = room("henry").members().get(0).id();

        buddyService.talked(roomId, henry).block();

        BuddyView buddy = room("henry").buddy();
        assertThat(buddy.talkedToday()).containsExactly(henry);
        assertThat(buddy.togetherToday()).isFalse();
        assertThat(buddy.exp()).isZero();
    }

    @Test
    void changingTheExpPerLevelKeepsEveryLevel() {
        String roomId = createRoom("henry").id();
        // Earned under 3 EXP per level: level 10, two thirds of the way to 11.
        int exp = 3 * 9 + 2;
        setExp(roomId, exp);
        mongo.save(new BuddyExpScale.Setting(BuddyExpScale.ID, 3), BuddyExpScale.SETTINGS)
                .block();

        expScale.run(new DefaultApplicationArguments());
        expScale.run(new DefaultApplicationArguments()); // scaled once, not again

        BuddyView buddy = room("henry").buddy();
        assertThat(buddy.exp()).isEqualTo(exp * BuddyRules.expPerLevel() / 3);
        assertThat(buddy.level()).isEqualTo(10);
        assertThat(buddy.levelProgress()).isBetween(0.6, 0.7);
    }

    @Test
    void careWordsInTheChatFeedAndCleanButSentencesDoNot() {
        duoRoom("henry", "yuki");
        clock.advance(BuddyRules.hungryAfter()); // hungry, and poops by now
        room("henry");
        TestSocket henry = connect("henry");
        TestSocket yuki = connect("yuki");

        henry.send(Map.of("type", "send", "clientMessageId", "c-1", "text", "밥 먹었어?"))
                .expect("ack");
        await(() -> room("henry").buddy().exp() == 1); // the sentence was counted as a message
        assertThat(room("henry").buddy().hungry()).isTrue(); // and did not feed
        henry.send(Map.of("type", "send", "clientMessageId", "c-2", "text", "밥!"));
        yuki.send(Map.of("type", "send", "clientMessageId", "c-3", "text", "🧹"));

        await(() -> timeline("henry").containsAll(List.of("FED", "CLEANED")));
        BuddyView buddy = room("henry").buddy();
        assertThat(buddy.hungry()).isFalse();
        assertThat(buddy.poops()).isZero();
        assertThat(timeline("henry")).containsOnlyOnce("FED");
    }

    @Test
    void onlyATopLevelBuddyCanGoItsOwnWay() {
        createRoom("henry");

        post("henry", "/api/rooms/me/buddy/graduate", Map.of("buddyName", "Mochi"))
                .expectStatus()
                .isEqualTo(409)
                .expectBody(JsonNode.class)
                .value(body -> assertThat(body.get("code").asString()).isEqualTo("BUDDY_NOT_GROWN"));
    }

    @Test
    void goingItsOwnWayKeepsItInTheAlbumAndANewEggGrowsAgain() {
        String roomId = createRoom("henry").id();
        hatch(roomId); // EVOLVED
        setExp(roomId, (BuddyRules.MAX_LEVEL - 1) * BuddyRules.expPerLevel());
        clock.advance(Duration.ofMinutes(1)); // the new egg is born later than the first

        post("henry", "/api/rooms/me/buddy/graduate", Map.of("buddyName", "Mochi"))
                .expectStatus()
                .isOk();

        JsonNode room = roomJson("henry");
        assertThat(room.get("buddy").get("name").asString()).isEqualTo("Mochi");
        assertThat(room.get("buddy").get("stage").asString()).isEqualTo("EGG");
        assertThat(room.get("album")).hasSize(1);
        assertThat(room.get("album").get(0).get("name").asString()).isEqualTo("Mugi");
        // The new egg hatches with its own line, not blocked by the first one's.
        hatch(roomId);
        assertThat(timeline("henry")).containsExactly("EVOLVED", "GRADUATED", "EVOLVED");
    }

    @Test
    void bothGraduatingAtOnceGraduatesOnce() {
        duoRoom("henry", "yuki");
        String roomId = room("henry").id();
        setExp(roomId, (BuddyRules.MAX_LEVEL - 1) * BuddyRules.expPerLevel());

        List<Integer> statuses = race(
                6,
                i -> post(i % 2 == 0 ? "henry" : "yuki", "/api/rooms/me/buddy/graduate", Map.of("buddyName", "Egg" + i))
                        .returnResult(Void.class)
                        .getStatus()
                        .value());

        assertThat(statuses).containsOnlyOnce(200);
        assertThat(roomJson("henry").get("album")).hasSize(1);
        assertThat(timeline("henry")).containsOnlyOnce("GRADUATED");
    }

    @Test
    void partnerSeesCareLive() {
        duoRoom("henry", "yuki");
        clock.advance(BuddyRules.hungryAfter());
        room("henry"); // notices hunger now, so the socket below only sees the feeding
        TestSocket yuki = connect("yuki");

        care("henry", "feed");

        JsonNode fed = yuki.expect("message").get("message");
        assertThat(fed.get("buddyEvent").asString()).isEqualTo("FED");
        assertThat(fed.get("actorId").asString()).isNotBlank();
        JsonNode buddy = yuki.expect("buddy").get("buddy");
        assertThat(buddy.get("fullness").asInt()).isEqualTo(100);
    }

    @Test
    void partnerSeesAPoopTheMomentItIsNoticed() {
        duoRoom("henry", "yuki");
        TestSocket yuki = connect("yuki");
        clock.advance(BuddyRules.poopEvery().plusMinutes(1)); // one poop, not hungry yet

        room("henry");

        assertThat(yuki.expect("message").get("message").get("buddyEvent").asString())
                .isEqualTo("POOPED");
        assertThat(yuki.expect("buddy").get("buddy").get("poops").asInt()).isEqualTo(1);
        room("henry"); // nothing new to tell
        assertThat(yuki.next()).isNull();
    }

    @Test
    void sendingAMessageGrowsTheBuddyLive() {
        duoRoom("henry", "yuki");
        TestSocket henry = connect("henry");
        TestSocket yuki = connect("yuki");

        henry.send(Map.of("type", "send", "clientMessageId", "c-1", "text", "hi"))
                .expect("ack");

        yuki.expect("message");
        assertThat(yuki.expect("buddy").get("buddy").get("exp").asInt()).isEqualTo(1);
        assertThat(henry.expect("buddy").get("buddy").get("exp").asInt()).isEqualTo(1);
    }

    @Test
    void roomsCreatedBeforeBuddyCareStillWork() {
        // A room as S2–S4 stored it: no care timestamps, no daily EXP counter.
        Instant bornAt = clock.instant().minus(Duration.ofHours(9));
        String roomId = new ObjectId().toHexString();
        User user = userService.getOrCreate("old-timer", "old-timer").block();
        mongo.getCollection("rooms")
                .flatMap(rooms -> Mono.from(rooms.insertOne(new Document("_id", new ObjectId(roomId))
                        .append("memberIds", List.of(user.id()))
                        .append("memberCount", 1)
                        .append(
                                "buddy",
                                new Document("name", "Mugi").append("exp", 0).append("bornAt", Date.from(bornAt)))
                        .append("createdAt", Date.from(bornAt)))))
                .block();
        userService.assignRoomIfNone(user.id(), roomId).block();

        assertThat(room("old-timer").buddy().hungry()).isTrue();
        assertThat(care("old-timer", "feed").changed()).isTrue();
        buddyService.onMessageSent(roomId).block();
        assertThat(room("old-timer").buddy().exp()).isEqualTo(BuddyRules.FEED_EXP + BuddyRules.MESSAGE_EXP);
    }

    // --- helpers ---

    // One message short of hatching, then the message.
    private void hatch(String roomId) {
        setExp(roomId, BuddyRules.minExp(BuddyRules.BABY_AT) - 1);
        buddyService.onMessageSent(roomId).block();
    }

    private void setExp(String roomId, int exp) {
        mongo.updateFirst(
                        Query.query(Criteria.where("_id").is(new ObjectId(roomId))),
                        new Update().set("buddy.exp", exp),
                        "rooms")
                .block();
    }

    private JsonNode roomJson(String uid) {
        return http.get()
                .uri("/api/rooms/me")
                .header("Authorization", "Bearer " + token(uid))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody(JsonNode.class)
                .returnResult()
                .getResponseBody();
    }

    private static void await(java.util.function.BooleanSupplier done) {
        for (int i = 0; i < 50 && !done.getAsBoolean(); i++) {
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        assertThat(done.getAsBoolean()).isTrue();
    }

    private List<String> timeline(String uid) {
        JsonNode page = http.get()
                .uri("/api/rooms/me/messages?limit=50")
                .header("Authorization", "Bearer " + token(uid))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody(JsonNode.class)
                .returnResult()
                .getResponseBody();
        List<String> events = new ArrayList<>();
        page.get("messages").forEach(m -> events.add(m.get("buddyEvent").asString()));
        return events.reversed(); // oldest first
    }

    private Care care(String uid, String action) {
        return post(uid, "/api/rooms/me/buddy/" + action, Map.of())
                .expectStatus()
                .isOk()
                .expectBody(Care.class)
                .returnResult()
                .getResponseBody();
    }

    private RoomView room(String uid) {
        return http.get()
                .uri("/api/rooms/me")
                .header("Authorization", "Bearer " + token(uid))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody(RoomView.class)
                .returnResult()
                .getResponseBody();
    }

    private RoomView createRoom(String uid) {
        return post(uid, "/api/rooms", Map.of("buddyName", "Mugi"))
                .expectStatus()
                .isCreated()
                .expectBody(RoomView.class)
                .returnResult()
                .getResponseBody();
    }

    private void duoRoom(String owner, String friend) {
        createRoom(owner);
        String code = post(owner, "/api/rooms/me/invitations", Map.of())
                .expectBody(JsonNode.class)
                .returnResult()
                .getResponseBody()
                .get("code")
                .asString();
        post(friend, "/api/invitations/" + code + "/accept", Map.of())
                .expectStatus()
                .isOk();
    }

    private TestSocket connect(String uid) {
        TestSocket socket = new TestSocket(URI.create("ws://localhost:" + port + "/ws"), json).ignoring("presence");
        sockets.add(socket);
        socket.expect("hello");
        socket.send(Map.of("type", "auth", "token", token(uid))).expect("ready");
        return socket;
    }

    private WebTestClient.ResponseSpec post(String uid, String path, Object body) {
        return http.post()
                .uri(path)
                .header("Authorization", "Bearer " + token(uid))
                .bodyValue(body)
                .exchange();
    }

    private static <T> List<T> race(int n, Function<Integer, T> call) {
        return Flux.range(0, n)
                .parallel(n)
                .runOn(Schedulers.boundedElastic())
                .map(call)
                .sequential()
                .collectList()
                .block();
    }
}
