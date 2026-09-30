package com.buddychat.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import reactor.netty.DisposableServer;
import reactor.netty.http.server.HttpServer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Against a stand-in for Expo's push API, with responses in the documented shapes. */
class ExpoPushSenderTest {

    private final JsonMapper json = JsonMapper.builder().build();
    private final Map<String, JsonNode> requests = new ConcurrentHashMap<>();
    private DisposableServer server;
    private ExpoPushSender sender;

    @BeforeEach
    void start() {
        server = HttpServer.create()
                .port(0)
                .route(routes -> routes.post(
                                "/--/api/v2/push/send",
                                (request, response) -> request.receive()
                                        .aggregate()
                                        .asString()
                                        .flatMap(body -> {
                                            requests.put("send", json.readTree(body));
                                            return response.header("Content-Type", "application/json")
                                                    .sendString(Mono.just("""
                                                    {"data": [
                                                      {"status": "ok", "id": "r-1"},
                                                      {"status": "error", "message": "not registered",
                                                       "details": {"error": "DeviceNotRegistered"}},
                                                      {"status": "error", "message": "too big",
                                                       "details": {"error": "MessageTooBig"}}
                                                    ]}"""))
                                                    .then();
                                        }))
                        .post(
                                "/--/api/v2/push/getReceipts",
                                (request, response) -> request.receive()
                                        .aggregate()
                                        .asString()
                                        .flatMap(body -> {
                                            requests.put("receipts", json.readTree(body));
                                            return response.header("Content-Type", "application/json")
                                                    .sendString(Mono.just("""
                                                    {"data": {
                                                      "r-1": {"status": "error", "message": "gone",
                                                              "details": {"error": "DeviceNotRegistered"}},
                                                      "r-2": {"status": "ok"}
                                                    }}"""))
                                                    .then();
                                        })))
                .bindNow();
        sender = new ExpoPushSender(new NotificationProperties(
                "http://localhost:" + server.port() + "/--/api/v2/push",
                null,
                Duration.ofSeconds(3),
                Duration.ofMinutes(15),
                null,
                null,
                "https://example.com"));
    }

    @AfterEach
    void stop() {
        server.disposeNow();
    }

    @Test
    void sendsExpoMessagesAndSortsOutTheTickets() {
        List<PushMessage> messages = List.of(
                message("ExponentPushToken[a]"), message("ExponentPushToken[b]"), message("ExponentPushToken[c]"));

        PushSender.Sent sent = sender.send(messages).block();

        JsonNode body = requests.get("send");
        assertThat(body.isArray()).isTrue();
        assertThat(body.get(0).get("to").asString()).isEqualTo("ExponentPushToken[a]");
        assertThat(body.get(0).get("title").asString()).isEqualTo("henry");
        assertThat(body.get(0).get("body").asString()).isEqualTo("hi");
        assertThat(body.get(0).get("sound").asString()).isEqualTo("default");
        assertThat(body.get(0).get("data").get("roomId").asString()).isEqualTo("room-1");
        assertThat(sent.pending()).containsExactly(Map.entry("r-1", "ExponentPushToken[a]"));
        assertThat(sent.invalidTokens()).containsExactly("ExponentPushToken[b]"); // not c: a different error
    }

    @Test
    void readsReceiptsForTokensThatAreGone() {
        List<String> invalid = sender.invalidTokens(
                        Map.of("r-1", "ExponentPushToken[a]", "r-2", "ExponentPushToken[d]"))
                .block();

        assertThat(requests.get("receipts").get("ids")).hasSize(2);
        assertThat(invalid).containsExactly("ExponentPushToken[a]");
    }

    private static PushMessage message(String token) {
        return new PushMessage(token, "henry", "hi", "default", Map.of("roomId", "room-1"));
    }
}
