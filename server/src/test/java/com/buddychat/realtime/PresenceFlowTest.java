package com.buddychat.realtime;

import static com.buddychat.TestJwtConfiguration.token;
import static org.assertj.core.api.Assertions.assertThat;

import com.buddychat.TestJwtConfiguration;
import com.buddychat.TestSocket;
import com.buddychat.TestcontainersConfiguration;
import com.buddychat.chat.ChatService;
import com.buddychat.chat.Message;
import com.buddychat.room.Invitation;
import com.buddychat.room.Room;
import com.buddychat.user.User;
import com.buddychat.user.UserService;
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
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({TestcontainersConfiguration.class, TestJwtConfiguration.class})
class PresenceFlowTest {

    @LocalServerPort
    int port;

    @Autowired
    JsonMapper json;

    @Autowired
    ReactiveMongoTemplate mongo;

    @Autowired
    UserService userService;

    @Autowired
    ChatService chatService;

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
    void partnerSeesMeComeOnlineAndGoOffline() {
        duoRoom("henry", "yuki");
        TestSocket henry = open("henry");
        assertThat(ready(henry).get("online")).isEmpty();

        TestSocket yuki = open("yuki");
        JsonNode yukiReady = ready(yuki);
        String henryId = yukiReady.get("online").get(0).asString();
        assertThat(yukiReady.get("online")).hasSize(1);

        JsonNode online = henry.expect("presence");
        String yukiId = online.get("userId").asString();
        assertThat(online.get("online").asBoolean()).isTrue();
        assertThat(yukiId).isNotEqualTo(henryId);

        yuki.close();
        JsonNode offline = henry.expect("presence");
        assertThat(offline.get("userId").asString()).isEqualTo(yukiId);
        assertThat(offline.get("online").asBoolean()).isFalse();
    }

    @Test
    void aSecondDeviceDoesNotChangePresence() {
        duoRoom("henry", "yuki");
        TestSocket henry = open("henry");
        ready(henry);
        TestSocket phone = open("yuki");
        ready(phone);
        henry.expect("presence");

        TestSocket laptop = open("yuki");
        ready(laptop);
        laptop.close();
        henry.expectSilence(); // yuki is still online on the phone

        phone.close();
        assertThat(henry.expect("presence").get("online").asBoolean()).isFalse();
    }

    @Test
    void typingReachesThePartnerButNotMyOtherDevices() {
        duoRoom("henry", "yuki");
        TestSocket henry = open("henry").ignoring("presence");
        ready(henry);
        TestSocket phone = open("yuki").ignoring("presence");
        String yukiId = ready(phone).get("userId").asString();
        TestSocket laptop = open("yuki").ignoring("presence");
        ready(laptop);

        phone.send(Map.of("type", "typing", "typing", true));

        JsonNode typing = henry.expect("typing");
        assertThat(typing.get("userId").asString()).isEqualTo(yukiId);
        assertThat(typing.get("typing").asBoolean()).isTrue();
        laptop.expectSilence();
        phone.expectSilence();
    }

    @Test
    void readMarkReachesThePartnerAndOnlyMovesForward() {
        duoRoom("henry", "yuki");
        TestSocket henry = open("henry").ignoring("presence");
        ready(henry);
        TestSocket yuki = open("yuki").ignoring("presence", "message");
        String yukiId = ready(yuki).get("userId").asString();
        String first = sendText(henry, "c-1");
        String second = sendText(henry, "c-2");

        yuki.send(Map.of("type", "read", "messageId", second));
        JsonNode read = henry.expect("read");
        assertThat(read.get("userId").asString()).isEqualTo(yukiId);
        assertThat(read.get("messageId").asString()).isEqualTo(second);

        yuki.send(Map.of("type", "read", "messageId", first)); // older: ignored
        yuki.send(Map.of("type", "read", "messageId", second)); // same: ignored
        henry.expectSilence();

        // Someone connecting later gets it from ready.
        TestSocket henryAgain = open("henry").ignoring("presence");
        assertThat(ready(henryAgain).get("reads").get(yukiId).asString()).isEqualTo(second);
    }

    @Test
    void cannotMarkAMessageOfAnotherRoomAsRead() {
        duoRoom("henry", "yuki");
        createRoom("mika");
        TestSocket mika = open("mika").ignoring("presence");
        ready(mika);
        String mikasMessage = sendText(mika, "m-1");
        TestSocket yuki = open("yuki").ignoring("presence");
        ready(yuki);

        yuki.send(Map.of("type", "read", "messageId", mikasMessage));
        assertThat(yuki.expect("error").get("code").asString()).isEqualTo("INVALID_REQUEST");
        yuki.send(Map.of("type", "read", "messageId", "not-an-id"));
        assertThat(yuki.expect("error").get("code").asString()).isEqualTo("INVALID_REQUEST");
    }

    @Test
    void concurrentReadsNeverMoveTheMarkBackwards() {
        duoRoom("henry", "yuki");
        TestSocket henry = open("henry").ignoring("presence");
        ready(henry);
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 6; i++) ids.add(sendText(henry, "c-" + i));
        User yuki = userService.getOrCreate("yuki", "yuki").block();

        // Several devices reporting different points at once; the newest only once, so a mark that
        // could move backwards would almost surely end on an older one. Repeated from no mark at
        // all, where the concurrent first writes race to create it (a newer read once lost there).
        for (int round = 0; round < 30; round++) {
            mongo.remove(new Query(), "reads").block();
            List<Boolean> moved = Flux.range(0, 24)
                    .parallel(12)
                    .runOn(Schedulers.boundedElastic())
                    .flatMap(i -> chatService.markRead(yuki, ids.get(i == 0 ? ids.size() - 1 : i % (ids.size() - 1))))
                    .sequential()
                    .collectList()
                    .block();

            assertThat(moved).as("round %d", round).contains(true);
            assertThat(chatService.readMarks(yuki.roomId()).block())
                    .as("round %d", round)
                    .containsEntry(yuki.id(), ids.getLast());
        }
    }

    // --- helpers ---

    private TestSocket open(String uid) {
        // Buddy growth from the messages sent here is covered in BuddyFlowTest.
        TestSocket socket = new TestSocket(URI.create("ws://localhost:" + port + "/ws"), json).ignoring("buddy");
        sockets.add(socket);
        socket.expect("hello");
        socket.send(Map.of("type", "auth", "token", token(uid)));
        return socket;
    }

    private static JsonNode ready(TestSocket socket) {
        return socket.expect("ready");
    }

    private static String sendText(TestSocket socket, String clientMessageId) {
        return socket.send(Map.of("type", "send", "clientMessageId", clientMessageId, "text", "hi"))
                .expect("ack")
                .get("message")
                .get("id")
                .asString();
    }

    private void createRoom(String uid) {
        post(uid, "/api/rooms", Map.of("buddyName", "Mugi")).expectStatus().isCreated();
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

    private WebTestClient.ResponseSpec post(String uid, String path, Object body) {
        return http.post()
                .uri(path)
                .header("Authorization", "Bearer " + token(uid))
                .bodyValue(body)
                .exchange();
    }
}
