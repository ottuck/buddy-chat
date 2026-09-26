package com.buddychat.realtime;

import java.time.Duration;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;

/**
 * Open connections per room, in memory. With a single backend replica this is enough; it is lost
 * on restart and clients reconnect (docs/project-plan.md §65.7). Scaling out would put Redis
 * Pub/Sub behind {@link #publish}.
 */
@Component
public class RoomHub {

    private final ConcurrentMap<String, Set<Connection>> rooms = new ConcurrentHashMap<>();

    /** One authenticated WebSocket. Events are queued on its sink and written by the handler. */
    static final class Connection {

        final String userId;
        final String roomId;
        private final Sinks.Many<ServerEvent> outbound = Sinks.many().unicast().onBackpressureBuffer();

        Connection(String userId, String roomId) {
            this.userId = userId;
            this.roomId = roomId;
        }

        void emit(ServerEvent event) {
            // Several threads may emit to the same connection; retry briefly instead of dropping.
            outbound.emitNext(event, Sinks.EmitFailureHandler.busyLooping(Duration.ofMillis(100)));
        }

        Flux<ServerEvent> events() {
            return outbound.asFlux();
        }

        void complete() {
            outbound.tryEmitComplete();
        }
    }

    void join(Connection connection) {
        rooms.computeIfAbsent(connection.roomId, id -> ConcurrentHashMap.newKeySet())
                .add(connection);
    }

    void leave(Connection connection) {
        rooms.computeIfPresent(connection.roomId, (id, connections) -> {
            connections.remove(connection);
            return connections.isEmpty() ? null : connections;
        });
    }

    /** Sends to every connection in the room except {@code except} (usually the sender's). */
    public void publish(String roomId, ServerEvent event, @Nullable Connection except) {
        Set<Connection> connections = rooms.get(roomId);
        if (connections == null) return;
        for (Connection connection : connections) {
            if (connection != except) connection.emit(event);
        }
    }
}
