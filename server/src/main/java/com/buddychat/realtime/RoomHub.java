package com.buddychat.realtime;

import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.function.Function;
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

    /**
     * Adds the connection and greets it with {@code greeting}, given who else in the room is
     * online. If it is the user's first connection there, the others are told they came online.
     * Joins and leaves of a room run one at a time, so presence events cannot arrive out of order.
     */
    void join(Connection connection, Function<List<String>, ServerEvent> greeting) {
        rooms.compute(connection.roomId, (id, connections) -> {
            Set<Connection> room = connections != null ? connections : ConcurrentHashMap.newKeySet();
            List<String> online = room.stream()
                    .map(c -> c.userId)
                    .filter(userId -> !userId.equals(connection.userId))
                    .distinct()
                    .toList();
            boolean first = room.stream().noneMatch(c -> c.userId.equals(connection.userId));
            connection.emit(greeting.apply(online));
            room.add(connection);
            if (first) emitToOthers(room, new ServerEvent.Presence(connection.userId, true), connection.userId);
            return room;
        });
    }

    /** Removes the connection. If it was the user's last one in the room, the others see them go offline. */
    void leave(Connection connection) {
        rooms.computeIfPresent(connection.roomId, (id, room) -> {
            if (!room.remove(connection)) return room;
            boolean last = room.stream().noneMatch(c -> c.userId.equals(connection.userId));
            if (last) emitToOthers(room, new ServerEvent.Presence(connection.userId, false), connection.userId);
            return room.isEmpty() ? null : room;
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

    /** Sends to the other members' connections, not to any of {@code userId}'s own devices. */
    void publishToOthers(String roomId, ServerEvent event, String userId) {
        Set<Connection> connections = rooms.get(roomId);
        if (connections != null) emitToOthers(connections, event, userId);
    }

    private static void emitToOthers(Set<Connection> connections, ServerEvent event, String userId) {
        for (Connection connection : connections) {
            if (!connection.userId.equals(userId)) connection.emit(event);
        }
    }
}
