package com.buddychat.realtime;

import com.buddychat.buddy.BuddyView;
import com.buddychat.chat.Message;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;

/** Messages the server sends over the WebSocket. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = ServerEvent.Hello.class, name = "hello"),
    @JsonSubTypes.Type(value = ServerEvent.Ready.class, name = "ready"),
    @JsonSubTypes.Type(value = ServerEvent.Ack.class, name = "ack"),
    @JsonSubTypes.Type(value = ServerEvent.NewMessage.class, name = "message"),
    @JsonSubTypes.Type(value = ServerEvent.MemberJoined.class, name = "member"),
    @JsonSubTypes.Type(value = ServerEvent.BuddyUpdated.class, name = "buddy"),
    @JsonSubTypes.Type(value = ServerEvent.Presence.class, name = "presence"),
    @JsonSubTypes.Type(value = ServerEvent.Typing.class, name = "typing"),
    @JsonSubTypes.Type(value = ServerEvent.Read.class, name = "read"),
    @JsonSubTypes.Type(value = ServerEvent.Error.class, name = "error"),
    @JsonSubTypes.Type(value = ServerEvent.Pong.class, name = "pong"),
})
public sealed interface ServerEvent {

    /**
     * First frame on every connection: the server is now reading, so the client may send
     * {@code auth}. A frame sent before this can be lost during the upgrade.
     */
    record Hello() implements ServerEvent {}

    /**
     * Authenticated. {@code online} is who else in the room is connected right now; {@code reads}
     * is each member's read mark (user id → newest message id they have read).
     */
    record Ready(String userId, String roomId, List<String> online, Map<String, String> reads) implements ServerEvent {}

    /** The sender's own message was stored (also for a resend of an already stored one). */
    record Ack(String clientMessageId, Message message) implements ServerEvent {}

    record NewMessage(Message message) implements ServerEvent {}

    /** A friend accepted an invitation to this room (solo → duo). */
    record MemberJoined(String userId, @Nullable String displayName) implements ServerEvent {}

    /** The buddy changed (care, EXP): its state as of now. */
    record BuddyUpdated(BuddyView buddy) implements ServerEvent {}

    /** A member's first connection opened or their last one closed. */
    record Presence(String userId, boolean online) implements ServerEvent {}

    /** A member started or stopped typing. Clients drop a "typing" that is not repeated. */
    record Typing(String userId, boolean typing) implements ServerEvent {}

    /** A member has read the room up to {@code messageId}. */
    record Read(String userId, String messageId) implements ServerEvent {}

    /** {@code clientMessageId} is set when a send failed, so the app can mark that message. */
    record Error(String code, @Nullable String clientMessageId) implements ServerEvent {}

    record Pong() implements ServerEvent {}
}
