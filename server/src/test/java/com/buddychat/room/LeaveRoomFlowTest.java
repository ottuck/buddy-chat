package com.buddychat.room;

import static com.buddychat.TestJwtConfiguration.token;
import static org.assertj.core.api.Assertions.assertThat;

import com.buddychat.TestJwtConfiguration;
import com.buddychat.TestSocket;
import com.buddychat.TestcontainersConfiguration;
import com.buddychat.chat.Message;
import com.buddychat.user.User;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
import reactor.core.scheduler.Schedulers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({TestcontainersConfiguration.class, TestJwtConfiguration.class})
class LeaveRoomFlowTest {

    @LocalServerPort
    int port;

    @Autowired
    JsonMapper json;

    @Autowired
    ReactiveMongoTemplate mongo;

    private final List<TestSocket> sockets = new ArrayList<>();
    private WebTestClient http;

    @BeforeEach
    void setUp() {
        Flux.just(Room.class, Invitation.class, User.class, Message.class)
                .flatMap(type -> mongo.remove(new Query(), type))
                .then(mongo.remove(new Query(), "reads"))
                .block();
        http = WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    @AfterEach
    void closeSockets() {
        sockets.forEach(TestSocket::close);
    }

    @Test
    void theOneWhoStaysKeepsTheRoomAndIsTold() {
        String roomId = duoRoom("henry", "yuki");
        TestSocket henry = connect("henry");
        TestSocket yukisPhone = connect("yuki");

        post("yuki", "/api/rooms/me/leave").expectStatus().isNoContent();

        assertThat(henry.expect("left").get("userId").asString())
                .isEqualTo(user("yuki").id());
        JsonNode note = henry.expect("message").get("message");
        assertThat(note.get("type").asString()).isEqualTo("SYSTEM");
        assertThat(note.get("systemEvent").asString()).isEqualTo("MEMBER_LEFT");
        assertThat(note.get("text").asString()).isEqualTo("yuki"); // the name, since yuki is no longer listed

        JsonNode room = get("henry", "/api/rooms/me")
                .expectStatus()
                .isOk()
                .expectBody(JsonNode.class)
                .returnResult()
                .getResponseBody();
        assertThat(room.get("id").asString()).isEqualTo(roomId);
        assertThat(room.get("members")).hasSize(1);
        assertThat(room.get("buddy").get("name").asString()).isEqualTo("Mugi");

        // Yuki's other device is cut off from the room, and yuki has no room now.
        assertThat(yukisPhone.expect("error").get("code").asString()).isEqualTo("ROOM_NOT_FOUND");
        assertThat(yukisPhone.awaitClosed()).isTrue();
        get("yuki", "/api/rooms/me").expectStatus().isNotFound();
        assertThat(user("yuki").roomId()).isNull();
    }

    @Test
    void leavingASoloRoomDeletesItWithItsHistory() {
        createRoom("henry");
        String roomId = user("henry").roomId();
        connect("henry")
                .send(Map.of("type", "send", "clientMessageId", "c-1", "text", "hi"))
                .expect("ack");

        post("henry", "/api/rooms/me/leave").expectStatus().isNoContent();

        assertThat(mongo.findById(roomId, Room.class).block()).isNull();
        assertThat(mongo.count(Query.query(Criteria.where("roomId").is(roomId)), Message.class)
                        .block())
                .isZero();
        assertThat(user("henry").roomId()).isNull();
    }

    @Test
    void bothLeavingAtOnceDeletesTheRoom() {
        for (int round = 0; round < 10; round++) {
            setUp();
            String roomId = duoRoom("henry", "yuki");

            List<Integer> statuses = Flux.just("henry", "yuki")
                    .parallel(2)
                    .runOn(Schedulers.boundedElastic())
                    .map(uid -> post(uid, "/api/rooms/me/leave")
                            .returnResult(Void.class)
                            .getStatus()
                            .value())
                    .sequential()
                    .collectList()
                    .block();

            assertThat(statuses).as("round %d", round).containsOnly(204);
            assertThat(mongo.findById(roomId, Room.class).block())
                    .as("round %d", round)
                    .isNull();
            assertThat(mongo.count(Query.query(Criteria.where("roomId").is(roomId)), Message.class)
                            .block())
                    .as("round %d: no leftover history", round)
                    .isZero();
            assertThat(user("henry").roomId()).isNull();
            assertThat(user("yuki").roomId()).isNull();
        }
    }

    @Test
    void leavingAgainFinishesALeaveThatFailedMidway() {
        String roomId = duoRoom("henry", "yuki");
        // State left by a leave that failed after taking yuki out of the room.
        mongo.updateFirst(
                        Query.query(Criteria.where("_id").is(roomId)),
                        new Update().pull("memberIds", user("yuki").id()).inc("memberCount", -1),
                        Room.class)
                .block();

        post("yuki", "/api/rooms/me/leave").expectStatus().isNoContent();

        assertThat(user("yuki").roomId()).isNull();
        assertThat(mongo.findById(roomId, Room.class).block().memberIds())
                .containsExactly(user("henry").id());
        post("yuki", "/api/rooms/me/leave").expectStatus().isNotFound(); // nothing left to leave
    }

    @Test
    void afterLeavingBothCanStartOver() {
        duoRoom("henry", "yuki");
        post("yuki", "/api/rooms/me/leave").expectStatus().isNoContent();

        createRoom("yuki");
        String code = invite("henry");
        post("mika", "/api/invitations/" + code + "/accept", Map.of())
                .expectStatus()
                .isOk();
    }

    // --- helpers ---

    private User user(String uid) {
        return mongo.findOne(Query.query(Criteria.where("firebaseUid").is(uid)), User.class)
                .block();
    }

    private TestSocket connect(String uid) {
        TestSocket socket = new TestSocket(URI.create("ws://localhost:" + port + "/ws"), json)
                .ignoring("buddy", "presence", "read", "typing");
        sockets.add(socket);
        socket.expect("hello");
        socket.send(Map.of("type", "auth", "token", token(uid))).expect("ready");
        return socket;
    }

    private void createRoom(String uid) {
        post(uid, "/api/rooms", Map.of("buddyName", "Mugi")).expectStatus().isCreated();
    }

    private String invite(String uid) {
        return post(uid, "/api/rooms/me/invitations", Map.of())
                .expectBody(JsonNode.class)
                .returnResult()
                .getResponseBody()
                .get("code")
                .asString();
    }

    private String duoRoom(String owner, String friend) {
        createRoom(owner);
        String code = invite(owner);
        post(friend, "/api/invitations/" + code + "/accept", Map.of())
                .expectStatus()
                .isOk();
        return user(owner).roomId();
    }

    private WebTestClient.ResponseSpec get(String uid, String path) {
        return http.get()
                .uri(path)
                .header("Authorization", "Bearer " + token(uid))
                .exchange();
    }

    private WebTestClient.ResponseSpec post(String uid, String path) {
        return post(uid, path, Map.of());
    }

    private WebTestClient.ResponseSpec post(String uid, String path, Object body) {
        return http.post()
                .uri(path)
                .header("Authorization", "Bearer " + token(uid))
                .bodyValue(body)
                .exchange();
    }
}
