package com.buddychat.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockJwt;

import com.buddychat.TestcontainersConfiguration;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

@SpringBootTest
@AutoConfigureWebTestClient
@Import(TestcontainersConfiguration.class)
class MeControllerTest {

    @Autowired
    WebTestClient client;

    @Autowired
    UserRepository users;

    @BeforeEach
    void clean() {
        users.deleteAll().block();
    }

    @Test
    void rejectsRequestsWithoutToken() {
        client.get().uri("/api/me").exchange().expectStatus().isUnauthorized();
    }

    @Test
    void createsUserOnFirstCallAndReturnsTheSameUserAfterwards() {
        var first = me("uid-1", "Yuki");
        var second = me("uid-1", "Yuki");

        assertThat(first.id()).isNotBlank().isEqualTo(second.id());
        assertThat(first.displayName()).isEqualTo("Yuki");
        assertThat(first.roomId()).isNull();
        assertThat(users.count().block()).isEqualTo(1);
    }

    @Test
    void anonymousUserHasNoDisplayName() {
        assertThat(me("uid-guest", null).displayName()).isNull();
    }

    @Test
    void concurrentFirstCallsCreateOnlyOneUser() {
        List<String> ids = Flux.range(0, 8)
                .parallel()
                .runOn(Schedulers.boundedElastic())
                .map(i -> me("uid-race", "Henry").id())
                .sequential()
                .collectList()
                .block();

        assertThat(ids).hasSize(8).containsOnly(ids.getFirst());
        assertThat(users.count().block()).isEqualTo(1);
    }

    private MeController.MeResponse me(String uid, String name) {
        return client.mutateWith(mockJwt().jwt(jwt -> {
                    jwt.subject(uid);
                    if (name != null) jwt.claim("name", name);
                }))
                .get()
                .uri("/api/me")
                .exchange()
                .expectStatus()
                .isOk()
                .expectBody(MeController.MeResponse.class)
                .returnResult()
                .getResponseBody();
    }
}
