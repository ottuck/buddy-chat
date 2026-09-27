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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
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
        clock.advance(Duration.ofHours(9));

        BuddyView buddy = room("henry").buddy();
        room("henry"); // looking again does not repeat the event

        assertThat(buddy.hungry()).isTrue();
        assertThat(buddy.canFeed()).isTrue();
        assertThat(buddy.fullness()).isLessThanOrEqualTo(30);
        // 9 hours is also enough for one poop.
        assertThat(timeline("henry")).containsExactlyInAnyOrder("HUNGRY", "POOPED");
    }

    @Test
    void feedingRestoresFullnessGivesExpAndLeavesATimelineEvent() {
        createRoom("henry");
        clock.advance(Duration.ofHours(9));

        Care care = care("henry", "feed");

        assertThat(care.changed()).isTrue();
        assertThat(care.buddy().fullness()).isEqualTo(100);
        assertThat(care.buddy().exp()).isEqualTo(BuddyRules.FEED_EXP);
        assertThat(timeline("henry")).containsExactly("FED");
    }

    @Test
    void bothMembersFeedingAtOnceFeedsItOnce() {
        duoRoom("henry", "yuki");
        clock.advance(Duration.ofHours(9));

        List<Boolean> changed =
                race(8, i -> care(i % 2 == 0 ? "henry" : "yuki", "feed").changed());

        assertThat(changed).containsOnlyOnce(true);
        assertThat(room("henry").buddy().exp()).isEqualTo(BuddyRules.FEED_EXP);
        assertThat(timeline("henry")).containsOnlyOnce("FED");
    }

    @Test
    void poopsPileUpAndCleaningClearsThemOnce() {
        duoRoom("henry", "yuki");
        clock.advance(Duration.ofHours(13)); // two poops (one per 6h)

        assertThat(room("henry").buddy().poops()).isEqualTo(2);
        List<Boolean> changed =
                race(6, i -> care(i % 2 == 0 ? "henry" : "yuki", "clean").changed());

        assertThat(changed).containsOnlyOnce(true);
        BuddyView after = room("henry").buddy();
        assertThat(after.poops()).isZero();
        assertThat(after.exp()).isEqualTo(BuddyRules.CLEAN_EXP);
        assertThat(timeline("henry")).filteredOn("POOPED"::equals).hasSize(2);
        assertThat(timeline("henry")).containsOnlyOnce("CLEANED");
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
    void hatchesWhenReachingLevelTwo() {
        String roomId = createRoom("henry").id();

        for (int i = 0; i < BuddyRules.EXP_PER_LEVEL; i++)
            buddyService.onMessageSent(roomId).block();

        BuddyView buddy = room("henry").buddy();
        assertThat(buddy.level()).isEqualTo(2);
        assertThat(buddy.stage()).isEqualTo(BuddyRules.Stage.BABY);
        assertThat(timeline("henry")).containsExactly("EVOLVED");
    }

    @Test
    void partnerSeesCareLive() {
        duoRoom("henry", "yuki");
        clock.advance(Duration.ofHours(9));
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
        TestSocket socket = new TestSocket(URI.create("ws://localhost:" + port + "/ws"), json);
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
