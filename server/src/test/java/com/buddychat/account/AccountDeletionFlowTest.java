package com.buddychat.account;

import static com.buddychat.TestJwtConfiguration.token;
import static org.assertj.core.api.Assertions.assertThat;

import com.buddychat.TestJwtConfiguration;
import com.buddychat.TestSocket;
import com.buddychat.TestcontainersConfiguration;
import com.buddychat.chat.Message;
import com.buddychat.room.Room;
import com.buddychat.user.User;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.bson.Document;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({TestcontainersConfiguration.class, TestJwtConfiguration.class})
class AccountDeletionFlowTest {

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
        Flux.just(Room.class, User.class, Message.class)
                .flatMap(type -> mongo.remove(new Query(), type))
                .thenMany(Flux.just("reads", "invitations", "push_tokens")
                        .flatMap(collection -> mongo.remove(new Query(), collection)))
                .blockLast();
        http = WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    @AfterEach
    void closeSockets() {
        sockets.forEach(TestSocket::close);
    }

    @Test
    void deletingLeavesTheRoomToThePartnerAndRemovesWhatWasOnlyTheirs() {
        String roomId = duoRoom("henry", "yuki");
        String yukiId = user("yuki").id();
        TestSocket henry = connect("henry");
        TestSocket yuki = connect("yuki");
        yuki.send(Map.of("type", "send", "clientMessageId", "c-1", "text", "bye"))
                .expect("ack");
        henry.expect("message");
        yuki.send(Map.of("type", "read", "messageId", lastMessageId(roomId)));
        awaitCount("reads", "userId", yukiId, 1);
        http.post()
                .uri("/api/me/push-tokens")
                .header("Authorization", "Bearer " + token("yuki"))
                .bodyValue(Map.of("token", "ExponentPushToken[yuki-phone]"))
                .exchange()
                .expectStatus()
                .is2xxSuccessful();

        delete("yuki").expectStatus().isNoContent();

        // Henry is told as when someone leaves, and keeps the room, the buddy and the conversation.
        assertThat(henry.expect("left").get("userId").asString()).isEqualTo(yukiId);
        assertThat(mongo.findById(roomId, Room.class).block().memberIds())
                .containsExactly(user("henry").id());
        assertThat(count("messages", "senderId", yukiId)).isEqualTo(1);
        // Nothing of yuki's own is left.
        assertThat(user("yuki")).isNull();
        assertThat(count("reads", "userId", yukiId)).isZero();
        assertThat(count("push_tokens", "userId", yukiId)).isZero();
    }

    @Test
    void deletingASoloAccountRemovesTheRoomAndItsInviteCodes() {
        createRoom("henry");
        String roomId = user("henry").roomId();
        String code = invite("henry");

        delete("henry").expectStatus().isNoContent();

        assertThat(mongo.findById(roomId, Room.class).block()).isNull();
        assertThat(count("messages", "roomId", roomId)).isZero();
        assertThat(count("invitations", "code", code)).isZero();
        assertThat(user("henry")).isNull();
    }

    @Test
    void deletingAgainIsHarmless() {
        createRoom("henry");
        delete("henry").expectStatus().isNoContent();

        delete("henry").expectStatus().isNoContent();

        assertThat(user("henry")).isNull();
    }

    // --- helpers ---

    private long count(String collection, String field, String value) {
        return mongo.count(Query.query(Criteria.where(field).is(value)), collection)
                .block();
    }

    private void awaitCount(String collection, String field, String value, long expected) {
        for (int i = 0; i < 50 && count(collection, field, value) != expected; i++) {
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        assertThat(count(collection, field, value)).isEqualTo(expected);
    }

    private String lastMessageId(String roomId) {
        return mongo.findOne(
                        Query.query(Criteria.where("roomId").is(roomId))
                                .with(Sort.by("_id").descending()),
                        Document.class,
                        "messages")
                .block()
                .getObjectId("_id")
                .toHexString();
    }

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

    private WebTestClient.ResponseSpec delete(String uid) {
        return http.delete()
                .uri("/api/me")
                .header("Authorization", "Bearer " + token(uid))
                .exchange();
    }

    private WebTestClient.ResponseSpec post(String uid, String path, Object body) {
        return http.post()
                .uri(path)
                .header("Authorization", "Bearer " + token(uid))
                .bodyValue(body)
                .exchange();
    }
}
