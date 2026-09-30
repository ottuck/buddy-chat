package com.buddychat.notification;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.buddychat.chat.ChatService;
import com.buddychat.chat.Message;
import com.buddychat.common.ApiException;
import com.buddychat.room.RoomService;
import com.buddychat.user.User;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mongodb.core.FindAndReplaceOptions;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import tools.jackson.databind.json.JsonMapper;

/**
 * Push notifications for new messages (docs/server-design.md, 푸시). A recipient is notified when
 * the message is still unread a moment after it was sent: someone looking at the chat marks it read
 * within a second, while an app in the background, suspended without a clean disconnect, or offline
 * does not. Buddy events are never pushed (docs/product.md).
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);
    private static final Pattern EXPO_TOKEN = Pattern.compile("^Expo(nent)?PushToken\\[[^\\]]{1,200}]$");
    private static final int MAX_BODY_LENGTH = 180;

    private final ReactiveMongoTemplate mongo;
    private final PushSender sender;
    private final WebPush webPush;
    private final JsonMapper json;
    private final RoomService roomService;
    private final ChatService chatService;
    private final NotificationProperties properties;
    private final Clock clock;

    NotificationService(
            ReactiveMongoTemplate mongo,
            PushSender sender,
            WebPush webPush,
            JsonMapper json,
            RoomService roomService,
            ChatService chatService,
            NotificationProperties properties,
            Clock clock) {
        this.mongo = mongo;
        this.sender = sender;
        this.webPush = webPush;
        this.json = json;
        this.roomService = roomService;
        this.chatService = chatService;
        this.properties = properties;
        this.clock = clock;
    }

    /** Remembers the device's token for the user, moving it from whoever had it before. */
    Mono<Void> register(User user, @Nullable String token) {
        if (token == null || !EXPO_TOKEN.matcher(token).matches()) {
            return Mono.error(new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST"));
        }
        return mongo.findAndReplace(
                        query(where("_id").is(token)),
                        new PushToken(token, user.id(), Instant.now(clock), null, null),
                        FindAndReplaceOptions.options().upsert())
                .then();
    }

    /** Remembers a browser's Web Push subscription for the user, as with an app's token. */
    Mono<Void> registerWeb(User user, @Nullable String endpoint, @Nullable String p256dh, @Nullable String auth) {
        if (endpoint == null || p256dh == null || auth == null || !WebPush.isPushService(endpoint)) {
            return Mono.error(new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST"));
        }
        return mongo.findAndReplace(
                        query(where("_id").is(endpoint)),
                        new PushToken(endpoint, user.id(), Instant.now(clock), p256dh, auth),
                        FindAndReplaceOptions.options().upsert())
                .then();
    }

    String webPushKey() {
        return webPush.publicKey();
    }

    /** Forgets the token, e.g. on sign-out. Only the user it belongs to can remove it. */
    Mono<Void> unregister(User user, String token) {
        return mongo.remove(query(where("_id").is(token).and("userId").is(user.id())), PushToken.class)
                .then();
    }

    /** Forgets all of the user's devices (account deletion). */
    public Mono<Void> forget(String userId) {
        return mongo.remove(query(where("userId").is(userId)), PushToken.class).then();
    }

    /**
     * After the grace period, notifies the room's other members who have not read the message. Runs
     * on its own: the caller does not wait, and a failure only means a missed notification.
     */
    public void onNewMessage(Message message, User from) {
        String text = message.text();
        String messageId = message.id();
        if (message.type() != Message.Type.TEXT || text == null || messageId == null) return;
        Mono.delay(properties.gracePeriod())
                .then(Mono.zip(roomService.memberIds(message.roomId()), chatService.readMarks(message.roomId())))
                .map(roomState -> roomState.getT1().stream()
                        .filter(memberId -> !memberId.equals(from.id()))
                        // Ids compare in timeline order (docs/server-design.md).
                        .filter(memberId ->
                                roomState.getT2().getOrDefault(memberId, "").compareTo(messageId) < 0)
                        .toList())
                .filter(unread -> !unread.isEmpty())
                .flatMap(unread -> mongo.find(query(where("userId").in(unread)), PushToken.class)
                        .collectList())
                .flatMap(tokens -> Mono.when(
                        sendToApps(
                                tokens.stream().filter(token -> !token.isWeb()).toList(), message, text, from),
                        sendToBrowsers(tokens.stream().filter(PushToken::isWeb).toList(), message, text, from)))
                .subscribe(null, e -> log.warn("Could not send push notifications: {}", e.toString()));
    }

    private Mono<Void> sendToApps(List<PushToken> tokens, Message message, String text, User from) {
        if (tokens.isEmpty()) return Mono.empty();
        return sender.send(tokens.stream()
                        .map(token -> toPush(token.token(), message.roomId(), text, from))
                        .toList())
                .flatMap(sent -> {
                    checkReceiptsLater(sent.pending());
                    return forget(sent.invalidTokens());
                });
    }

    // Same title and text as the app's; the service worker (app: public/sw.js) shows it.
    private Mono<Void> sendToBrowsers(List<PushToken> subscriptions, Message message, String text, User from) {
        if (subscriptions.isEmpty()) return Mono.empty();
        PushMessage push = toPush("", message.roomId(), text, from);
        String payload = json.writeValueAsString(Map.of("title", push.title(), "body", push.body(), "url", "/"));
        return Flux.fromIterable(subscriptions)
                .flatMap(subscription ->
                        webPush.send(subscription, payload).filter(gone -> gone).map(gone -> subscription.token()))
                .collectList()
                .flatMap(this::forget);
    }

    private static PushMessage toPush(String token, String roomId, String text, User from) {
        String body = text.length() > MAX_BODY_LENGTH ? text.substring(0, MAX_BODY_LENGTH) + "…" : text;
        String title = from.displayName() != null ? from.displayName() : "buddy-chat";
        return new PushMessage(token, title, body, "default", Map.of("roomId", roomId));
    }

    // Kept in memory, not scheduled: after a restart these are skipped, and a bad token shows up
    // again on its next send.
    private void checkReceiptsLater(Map<String, String> pending) {
        if (pending.isEmpty()) return;
        Mono.delay(properties.receiptDelay())
                .then(sender.invalidTokens(pending))
                .flatMap(this::forget)
                .subscribe(null, e -> log.warn("Could not check push receipts: {}", e.toString()));
    }

    // Tokens of uninstalled apps would fail every time.
    private Mono<Void> forget(List<String> invalid) {
        if (invalid.isEmpty()) return Mono.empty();
        return mongo.remove(query(where("_id").in(invalid)), PushToken.class).then();
    }
}
