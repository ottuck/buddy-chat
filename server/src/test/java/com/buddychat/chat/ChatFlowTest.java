package com.buddychat.chat;

import static com.buddychat.TestJwtConfiguration.token;
import static org.assertj.core.api.Assertions.assertThat;

import com.buddychat.TestJwtConfiguration;
import com.buddychat.TestSocket;
import com.buddychat.TestcontainersConfiguration;
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
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"buddychat.realtime.auth-timeout=3s"})
@Import({TestcontainersConfiguration.class, TestJwtConfiguration.class})
class ChatFlowTest {

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

    record Page(List<Message> messages, boolean hasMore) {}

    @BeforeEach
    void setUp() {
        Flux.just(Room.class, Invitation.class, User.class, Message.class)
                .flatMap(type -> mongo.remove(new Query(), type))
                .blockLast();
        http = WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    @AfterEach
    void closeSockets() {
        sockets.forEach(TestSocket::close);
    }

    @Test
    void deliversMessageToPartnerAndAcksSender() {
        duoRoom("henry", "yuki");
        TestSocket henry = connect("henry");
        TestSocket yuki = connect("yuki");

        henry.send(Map.of("type", "send", "clientMessageId", "c-1", "text", "  おつかれ〜 "));

        JsonNode ack = henry.expect("ack");
        assertThat(ack.get("clientMessageId").asString()).isEqualTo("c-1");
        JsonNode delivered = yuki.expect("message").get("message");
        assertThat(delivered.get("id").asString())
                .isEqualTo(ack.get("message").get("id").asString());
        assertThat(delivered.get("text").asString()).isEqualTo("おつかれ〜");
        assertThat(delivered.get("type").asString()).isEqualTo("TEXT");
        henry.expectSilence(); // the sender gets the ack, not its own message again
    }

    @Test
    void ownerHearsWhenAFriendJoins() {
        createRoom("henry");
        TestSocket henry = connect("henry");

        String code = invite("henry");
        post("yuki", "/api/invitations/" + code + "/accept", Map.of())
                .expectStatus()
                .isOk();

        JsonNode joined = henry.expect("member");
        assertThat(joined.get("displayName").asString()).isEqualTo("yuki");
    }

    @Test
    void resendWithSameClientMessageIdIsStoredAndDeliveredOnce() {
        duoRoom("henry", "yuki");
        TestSocket henry = connect("henry");
        TestSocket yuki = connect("yuki");
        Map<String, String> send = Map.of("type", "send", "clientMessageId", "retry-1", "text", "hello");

        String first = henry.send(send).expect("ack").get("message").get("id").asString();
        String second = henry.send(send).expect("ack").get("message").get("id").asString();

        assertThat(second).isEqualTo(first);
        yuki.expect("message");
        yuki.expectSilence();
        assertThat(history("henry", "").messages()).hasSize(1);
    }

    @Test
    void resendOnANewConnectionIsAlsoDeduplicated() {
        duoRoom("henry", "yuki");
        Map<String, String> send = Map.of("type", "send", "clientMessageId", "flaky-1", "text", "hi");
        TestSocket before = connect("henry");
        String first = before.send(send).expect("ack").get("message").get("id").asString();
        before.close();

        String again = connect("henry")
                .send(send)
                .expect("ack")
                .get("message")
                .get("id")
                .asString();

        assertThat(again).isEqualTo(first);
        assertThat(history("henry", "").messages()).hasSize(1);
    }

    @Test
    void keepsTheOrderMessagesWereSentIn() {
        duoRoom("henry", "yuki");
        TestSocket henry = connect("henry");
        for (int i = 0; i < 20; i++) {
            henry.send(Map.of("type", "send", "clientMessageId", "o-" + i, "text", "m" + i));
        }
        for (int i = 0; i < 20; i++) henry.expect("ack");

        // 20 messages also hatch the egg; only the texts matter here.
        List<String> texts = history("henry", "?limit=50").messages().reversed().stream()
                .filter(m -> m.type() == Message.Type.TEXT)
                .map(Message::text)
                .toList();
        assertThat(texts)
                .containsExactly(java.util.stream.IntStream.range(0, 20)
                        .mapToObj(i -> "m" + i)
                        .toArray(String[]::new));
    }

    @Test
    void historyPagesBackwardsAndCatchesUpForwards() {
        duoRoom("henry", "yuki");
        User henry = userService.getOrCreate("henry", "henry").block();
        for (int i = 0; i < 35; i++) chatService.send(henry, "p-" + i, "m" + i).block();

        Page newest = history("yuki", "?limit=30");
        assertThat(newest.messages()).hasSize(30);
        assertThat(newest.hasMore()).isTrue();
        assertThat(newest.messages().getFirst().text()).isEqualTo("m34");

        Page older = history(
                "yuki", "?limit=30&before=" + newest.messages().getLast().id());
        assertThat(older.messages()).extracting(Message::text).containsExactly("m4", "m3", "m2", "m1", "m0");
        assertThat(older.hasMore()).isFalse();

        // After a reconnect: everything newer than the last message the app had.
        Page missed =
                history("yuki", "?limit=3&after=" + older.messages().getFirst().id());
        assertThat(missed.messages()).extracting(Message::text).containsExactly("m7", "m6", "m5");
        assertThat(missed.hasMore()).isTrue();
    }

    @Test
    void otherRoomsDoNotReceiveMessages() {
        duoRoom("henry", "yuki");
        createRoom("mika");
        TestSocket henry = connect("henry");
        TestSocket mika = connect("mika");

        henry.send(Map.of("type", "send", "clientMessageId", "c-1", "text", "secret"))
                .expect("ack");

        mika.expectSilence();
        assertThat(history("mika", "").messages()).isEmpty();
    }

    @Test
    void invalidMessageIsReportedAndTheConnectionStaysUsable() {
        createRoom("henry");
        TestSocket henry = connect("henry");

        JsonNode error = henry.send(Map.of("type", "send", "clientMessageId", "c-1", "text", "   "))
                .expect("error");
        assertThat(error.get("code").asString()).isEqualTo("INVALID_MESSAGE");
        assertThat(error.get("clientMessageId").asString()).isEqualTo("c-1");

        henry.send(Map.of("type", "ping")).expect("pong");
        henry.send(Map.of("nonsense", true)).expect("error");
    }

    @Test
    void rejectsAnInvalidToken() {
        createRoom("henry");
        TestSocket socket = open().send(Map.of("type", "auth", "token", "not-a-token"));

        assertThat(socket.expect("error").get("code").asString()).isEqualTo("UNAUTHORIZED");
        assertThat(socket.awaitClosed()).isTrue();
    }

    @Test
    void firstMessageMustBeAuth() {
        createRoom("henry");
        TestSocket socket = open().send(Map.of("type", "send", "clientMessageId", "c", "text", "hi"));

        assertThat(socket.expect("error").get("code").asString()).isEqualTo("UNAUTHORIZED");
        assertThat(socket.awaitClosed()).isTrue();
    }

    @Test
    void closesConnectionsThatNeverAuthenticate() {
        TestSocket socket = open(); // hello, then nothing

        assertThat(socket.expect("error").get("code").asString()).isEqualTo("AUTH_TIMEOUT");
        assertThat(socket.awaitClosed()).isTrue();
    }

    @Test
    void slowTokenCheckDoesNotCountAgainstTheAuthDeadline() {
        createRoom("slow-henry"); // verifying this token takes longer than the deadline
        connect("slow-henry").send(Map.of("type", "ping")).expect("pong");
    }

    @Test
    void userWithoutRoomCannotConnect() {
        TestSocket socket = open().send(Map.of("type", "auth", "token", token("loner")));

        assertThat(socket.expect("error").get("code").asString()).isEqualTo("ROOM_NOT_FOUND");
        assertThat(socket.awaitClosed()).isTrue();
    }

    @Test
    void historyNeedsARoom() {
        http.get()
                .uri("/api/rooms/me/messages")
                .header("Authorization", "Bearer " + token("loner"))
                .exchange()
                .expectStatus()
                .isNotFound();
    }

    // --- helpers ---

    // Like the app: wait for the server's hello before sending anything.
    private TestSocket open() {
        TestSocket socket = openSilently();
        socket.expect("hello");
        return socket;
    }

    private TestSocket openSilently() {
        // Buddy growth from chatting is covered in BuddyFlowTest, presence in PresenceFlowTest.
        TestSocket socket =
                new TestSocket(URI.create("ws://localhost:" + port + "/ws"), json).ignoring("buddy", "presence");
        sockets.add(socket);
        return socket;
    }

    private TestSocket connect(String uid) {
        TestSocket socket = open().send(Map.of("type", "auth", "token", token(uid)));
        socket.expect("ready");
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

    private void duoRoom(String owner, String friend) {
        createRoom(owner);
        String code = invite(owner);
        post(friend, "/api/invitations/" + code + "/accept", Map.of())
                .expectStatus()
                .isOk();
    }

    private Page history(String uid, String query) {
        return http.get()
                .uri("/api/rooms/me/messages" + query)
                .header("Authorization", "Bearer " + token(uid))
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody(Page.class)
                .returnResult()
                .getResponseBody();
    }

    private WebTestClient.ResponseSpec post(String uid, String path, Object body) {
        return http.post()
                .uri(path)
                .header("Authorization", "Bearer " + token(uid))
                .bodyValue(body)
                .exchange();
    }
}
