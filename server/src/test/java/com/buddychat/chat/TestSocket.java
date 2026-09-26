package com.buddychat.chat;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.time.Duration;
import java.util.concurrent.BlockingQueue;
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
class TestSocket implements AutoCloseable {

    private static final Duration WAIT = Duration.ofSeconds(5);

    private final JsonMapper json;
    private final Sinks.Many<String> outbound = Sinks.many().unicast().onBackpressureBuffer();
    private final BlockingQueue<JsonNode> received = new LinkedBlockingQueue<>();
    private final CountDownLatch closed = new CountDownLatch(1);
    private final Disposable connection;

    TestSocket(URI uri, JsonMapper json) {
        this.json = json;
        this.connection = new ReactorNettyWebSocketClient()
                .execute(
                        uri,
                        session -> session.send(outbound.asFlux().map(session::textMessage))
                                .and(session.receive()
                                        .filter(m -> m.getType() == WebSocketMessage.Type.TEXT)
                                        .map(WebSocketMessage::getPayloadAsText)
                                        .doOnNext(text -> received.add(json.readTree(text)))
                                        .then()))
                .doFinally(signal -> closed.countDown())
                .subscribe();
    }

    TestSocket send(Object event) {
        outbound.tryEmitNext(json.writeValueAsString(event));
        return this;
    }

    /** The next event, which must be of the given type. */
    JsonNode expect(String type) {
        JsonNode event = next();
        assertThat(event).as("waited for '%s'", type).isNotNull();
        assertThat(event.get("type").asString()).as("event: %s", event).isEqualTo(type);
        return event;
    }

    JsonNode next() {
        try {
            return received.poll(WAIT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Asserts nothing else arrives within a short window. */
    void expectSilence() {
        try {
            assertThat(received.poll(300, TimeUnit.MILLISECONDS)).isNull();
        } catch (InterruptedException e) {
            throw new IllegalStateException(e);
        }
    }

    boolean awaitClosed() {
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
