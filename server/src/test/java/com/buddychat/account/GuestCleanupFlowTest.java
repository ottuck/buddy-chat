package com.buddychat.account;

import static com.buddychat.TestJwtConfiguration.guestToken;
import static com.buddychat.TestJwtConfiguration.token;
import static org.assertj.core.api.Assertions.assertThat;

import com.buddychat.MutableClock;
import com.buddychat.TestJwtConfiguration;
import com.buddychat.TestcontainersConfiguration;
import com.buddychat.chat.Message;
import com.buddychat.room.Room;
import com.buddychat.user.User;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import tools.jackson.databind.JsonNode;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import({TestcontainersConfiguration.class, TestJwtConfiguration.class, MutableClock.Config.class})
class GuestCleanupFlowTest {

    @LocalServerPort
    int port;

    @Autowired
    ReactiveMongoTemplate mongo;

    @Autowired
    MutableClock clock;

    @Autowired
    GuestCleanup cleanup;

    private WebTestClient http;

    @BeforeEach
    void setUp() {
        clock.reset();
        Flux.just(Room.class, User.class, Message.class)
                .flatMap(type -> mongo.remove(new Query(), type))
                .thenMany(Flux.just("reads", "invitations", "push_tokens")
                        .flatMap(collection -> mongo.remove(new Query(), collection)))
                .blockLast();
        http = WebTestClient.bindToServer().baseUrl("http://localhost:" + port).build();
    }

    @Test
    void deletesGuestsFirebaseNoLongerHasAndNobodyElse() {
        createRoom(guestToken("gone"));
        String goneRoom = user("gone").roomId();
        createRoom(guestToken("still-here"));
        createRoom(guestToken("linked"));
        createRoom(token("google-user"));

        clock.advance(Duration.ofDays(38));
        me(guestToken("still-here")); // Firebase has not deleted this one yet; it is in use
        me(token("linked")); // linked Google: the same uid, no longer a guest
        clock.advance(Duration.ofDays(2));

        assertThat(cleanup.run().block()).isEqualTo(1);

        assertThat(user("gone")).isNull();
        assertThat(mongo.findById(goneRoom, Room.class).block()).isNull();
        assertThat(user("still-here")).isNotNull();
        assertThat(user("linked")).isNotNull();
        assertThat(user("linked").guest()).isFalse();
        assertThat(user("google-user")).isNotNull(); // away for 40 days, but has an account
    }

    @Test
    void aDeletedGuestsPartnerKeepsTheRoom() {
        createRoom(token("henry"));
        String code = post(token("henry"), "/api/rooms/me/invitations")
                .expectBody(JsonNode.class)
                .returnResult()
                .getResponseBody()
                .get("code")
                .asString();
        post(guestToken("guest-friend"), "/api/invitations/" + code + "/accept")
                .expectStatus()
                .isOk();
        String roomId = user("henry").roomId();

        clock.advance(Duration.ofDays(40));
        assertThat(cleanup.run().block()).isEqualTo(1);

        assertThat(user("guest-friend")).isNull();
        assertThat(mongo.findById(roomId, Room.class).block().memberIds())
                .containsExactly(user("henry").id());
    }

    @Test
    void aGuestIsSeenAtMostOnceADay() {
        me(guestToken("daily"));
        var first = user("daily").lastSeenAt();

        clock.advance(Duration.ofHours(5));
        me(guestToken("daily"));
        assertThat(user("daily").lastSeenAt()).isEqualTo(first);

        clock.advance(Duration.ofHours(20));
        me(guestToken("daily"));
        assertThat(user("daily").lastSeenAt()).isAfter(first);
    }

    // --- helpers ---

    private User user(String uid) {
        return mongo.findOne(Query.query(Criteria.where("firebaseUid").is(uid)), User.class)
                .block();
    }

    private void me(String bearer) {
        http.get()
                .uri("/api/me")
                .header("Authorization", "Bearer " + bearer)
                .exchange()
                .expectStatus()
                .isOk();
    }

    private void createRoom(String bearer) {
        http.post()
                .uri("/api/rooms")
                .header("Authorization", "Bearer " + bearer)
                .bodyValue(Map.of("buddyName", "Mugi"))
                .exchange()
                .expectStatus()
                .isCreated();
    }

    private WebTestClient.ResponseSpec post(String bearer, String path) {
        return http.post()
                .uri(path)
                .header("Authorization", "Bearer " + bearer)
                .bodyValue(Map.of())
                .exchange();
    }
}
