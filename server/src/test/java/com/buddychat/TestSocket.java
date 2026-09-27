package com.buddychat;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.springframework.web.reactive.socket.WebSocketMessage;
import org.springframework.web.reactive.socket.client.ReactorNettyWebSocketClient;
import reactor.core.Disposable;
import reactor.core.publisher.Sinks;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** A blocking WebSocket client for tests: send JSON, then wait for what comes back. */
public class TestSocket implements AutoCloseable {

    private static final Duration WAIT = Duration.ofSeconds(10);

    private final JsonMapper json;
    private final Sinks.Many<String> outbound = Sinks.many().unicast().onBackpressureBuffer();
    private final BlockingQueue<JsonNode> received = new LinkedBlockingQueue<>();
    // Everything received so far, for failure messages.
    private final List<String> log = new CopyOnWriteArrayList<>();
    private final Set<String> ignored = ConcurrentHashMap.newKeySet();
    private final CountDownLatch closed = new CountDownLatch(1);
    private final Disposable connection;

    public TestSocket(URI uri, JsonMapper json) {
        this.json = json;
        this.connection = new ReactorNettyWebSocketClient()
                .execute(
                        uri,
                        session -> session.send(outbound.asFlux().map(session::textMessage))
                                .and(session.receive()
                                        .filter(m -> m.getType() == WebSocketMessage.Type.TEXT)
                                        .map(WebSocketMessage::getPayloadAsText)
                                        .doOnNext(text -> {
                                            log.add(text);
                                            received.add(json.readTree(text));
                                        })
                                        .then()))
                .doFinally(signal -> closed.countDown())
                .subscribe();
    }

    public TestSocket send(Object event) {
        // Fail loudly rather than lose a message the test thinks it sent.
        outbound.emitNext(json.writeValueAsString(event), Sinks.EmitFailureHandler.busyLooping(Duration.ofSeconds(1)));
        return this;
    }

    /** The next event, which must be of the given type. */
    public JsonNode expect(String type) {
        JsonNode event = next();
        assertThat(event)
                .as("waited for '%s'; received so far: %s; closed: %s", type, log, closed.getCount() == 0)
                .isNotNull();
        assertThat(event.get("type").asString())
                .as("event: %s; received so far: %s", event, log)
                .isEqualTo(type);
        return event;
    }

    public JsonNode next() {
        return poll(WAIT);
    }

    /** Events of these types are skipped (e.g. "buddy" updates in tests about chat). */
    public TestSocket ignoring(String... types) {
        ignored.addAll(List.of(types));
        return this;
    }

    private JsonNode poll(Duration wait) {
        long deadline = System.nanoTime() + wait.toNanos();
        try {
            while (true) {
                JsonNode event = received.poll(deadline - System.nanoTime(), TimeUnit.NANOSECONDS);
                if (event == null || !ignored.contains(event.get("type").asString())) return event;
            }
        } catch (InterruptedException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Asserts nothing else arrives within a short window. */
    public void expectSilence() {
        assertThat(poll(Duration.ofMillis(300))).isNull();
    }

    public boolean awaitClosed() {
        try {
            return closed.await(WAIT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            throw new IllegalStateException(e);
        }
    }

    @Override
    public void close() {
        outbound.tryEmitComplete();
        connection.dispose();
    }
}
