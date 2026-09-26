package com.buddychat.realtime;

import com.buddychat.chat.ChatService;
import com.buddychat.common.ApiException;
import com.buddychat.user.User;
import com.buddychat.user.UserService;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketMessage;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * {@code /ws}. Browsers cannot put headers on a WebSocket, so the Firebase ID token arrives as the
 * first message instead of in the URL (where it would end up in logs).
 *
 * <p>Events from one connection are handled one at a time ({@code concatMap}), so a sender's
 * messages are stored in the order they were sent.
 */
@Component
class ChatWebSocketHandler implements WebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ChatWebSocketHandler.class);

    private final ReactiveJwtDecoder jwtDecoder;
    private final UserService userService;
    private final ChatService chatService;
    private final RoomHub hub;
    private final JsonMapper json;
    private final RealtimeProperties properties;

    ChatWebSocketHandler(
            ReactiveJwtDecoder jwtDecoder,
            UserService userService,
            ChatService chatService,
            RoomHub hub,
            JsonMapper json,
            RealtimeProperties properties) {
        this.jwtDecoder = jwtDecoder;
        this.userService = userService;
        this.chatService = chatService;
        this.hub = hub;
        this.json = json;
        this.properties = properties;
    }

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        // Everything written to this session goes through one queue. Before authentication it
        // only ever carries an error; afterwards the connection's own sink takes over.
        Sinks.Many<ServerEvent> preAuth = Sinks.many().unicast().onBackpressureBuffer();
        Sinks.One<Flux<ServerEvent>> outboundSource = Sinks.one();
        // Signalled when the first message arrives; verifying it may take a while after that.
        Sinks.Empty<Void> firstMessage = Sinks.empty();
        long openedAt = System.nanoTime();
        log.debug("[{}] opened", session.getId());

        Flux<String> inbound = session.receive()
                .filter(message -> message.getType() == WebSocketMessage.Type.TEXT)
                .map(WebSocketMessage::getPayloadAsText);

        Mono<Void> input = inbound.switchOnFirst((first, rest) -> {
                    firstMessage.tryEmitEmpty();
                    log.debug(
                            "[{}] first message after {} ms",
                            session.getId(),
                            (System.nanoTime() - openedAt) / 1_000_000);
                    ClientEvent event = first.hasValue() ? parse(first.get()) : null;
                    if (!(event instanceof ClientEvent.Auth auth)) {
                        return reject(preAuth, outboundSource, "UNAUTHORIZED");
                    }
                    return authenticate(auth.token())
                            .flatMapMany(user -> {
                                RoomHub.Connection connection = new RoomHub.Connection(user.id(), user.roomId());
                                // Loses only if the auth deadline already rejected this socket.
                                if (outboundSource
                                        .tryEmitValue(connection.events())
                                        .isFailure()) {
                                    return Flux.empty();
                                }
                                hub.join(connection);
                                log.debug(
                                        "[{}] authenticated user {} in room {}",
                                        session.getId(),
                                        user.id(),
                                        user.roomId());
                                connection.emit(new ServerEvent.Ready(user.id(), user.roomId()));
                                return rest.skip(1)
                                        .concatMap(text -> onEvent(connection, user, text))
                                        .doFinally(signal -> {
                                            hub.leave(connection);
                                            connection.complete();
                                        });
                            })
                            .onErrorResume(ApiException.class, e -> reject(preAuth, outboundSource, e.code()))
                            .onErrorResume(JwtException.class, e -> reject(preAuth, outboundSource, "UNAUTHORIZED"));
                })
                .then();

        // A socket that sends nothing in time is rejected. A timer rather than a timeout on
        // receive(): cancelling the inbound stream would drop the connection before the error is
        // written. The deadline covers only the wait for the first message, not verifying it (the
        // first token check may fetch Google's keys).
        Mono<Void> authDeadline = Mono.delay(properties.authTimeout())
                .doOnNext(tick -> reject(preAuth, outboundSource, "AUTH_TIMEOUT"))
                .takeUntilOther(firstMessage.asMono())
                .then();

        Sinks.Empty<Void> outboundDone = Sinks.empty();
        Flux<WebSocketMessage> events = outboundSource
                .asMono()
                .flatMapMany(source -> source)
                .map(event -> session.textMessage(json.writeValueAsString(event)))
                .doFinally(signal -> outboundDone.tryEmitEmpty());
        Flux<WebSocketMessage> pings = Flux.interval(properties.pingInterval(), properties.pingInterval())
                .map(i -> session.pingMessage(factory -> factory.allocateBuffer(0)))
                .takeUntilOther(outboundDone.asMono());

        // When the outbound side ends (rejected, or the client went away) the socket is closed.
        Mono<Void> output = session.send(Flux.merge(events, pings)).then(session.close());
        return Mono.when(input, output, authDeadline);
    }

    private Mono<User> authenticate(String token) {
        return jwtDecoder
                .decode(token)
                .flatMap(userService::current)
                .flatMap(user -> user.roomId() == null
                        ? Mono.error(new ApiException(HttpStatus.CONFLICT, "ROOM_NOT_FOUND"))
                        : Mono.just(user));
    }

    private Mono<Void> onEvent(RoomHub.Connection connection, User user, String text) {
        ClientEvent event = parse(text);
        return switch (event) {
            case ClientEvent.Send send ->
                chatService
                        .send(user, send.clientMessageId(), send.text())
                        .doOnNext(result -> {
                            connection.emit(new ServerEvent.Ack(send.clientMessageId(), result.message()));
                            // A resend was already delivered to the others the first time.
                            if (result.created()) {
                                hub.publish(
                                        connection.roomId, new ServerEvent.NewMessage(result.message()), connection);
                            }
                        })
                        .onErrorResume(ApiException.class, e -> {
                            connection.emit(new ServerEvent.Error(e.code(), send.clientMessageId()));
                            return Mono.empty();
                        })
                        .then();
            case ClientEvent.Ping ping -> {
                connection.emit(new ServerEvent.Pong());
                yield Mono.empty();
            }
            case ClientEvent.Auth auth -> Mono.empty(); // already authenticated
            case null -> {
                connection.emit(new ServerEvent.Error("INVALID_EVENT", null));
                yield Mono.empty();
            }
        };
    }

    // Sends one error and closes. Does nothing if the socket was already authenticated or rejected:
    // whoever sets the outbound source first wins.
    private <T> Flux<T> reject(
            Sinks.Many<ServerEvent> preAuth, Sinks.One<Flux<ServerEvent>> outboundSource, String code) {
        if (outboundSource.tryEmitValue(preAuth.asFlux()).isSuccess()) {
            log.debug("Rejected a WebSocket: {}", code);
            preAuth.tryEmitNext(new ServerEvent.Error(code, null));
            preAuth.tryEmitComplete();
        }
        return Flux.empty();
    }

    private @Nullable ClientEvent parse(String text) {
        try {
            return json.readValue(text, ClientEvent.class);
        } catch (JacksonException e) {
            log.debug("Unreadable WebSocket message: {}", e.getOriginalMessage());
            return null;
        }
    }
}
