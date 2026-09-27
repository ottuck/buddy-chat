package com.buddychat.realtime;

import com.buddychat.buddy.BuddyView;
import com.buddychat.chat.Message;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
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
    @JsonSubTypes.Type(value = ServerEvent.Error.class, name = "error"),
    @JsonSubTypes.Type(value = ServerEvent.Pong.class, name = "pong"),
})
public sealed interface ServerEvent {

    /**
     * First frame on every connection: the server is now reading, so the client may send
     * {@code auth}. A frame sent before this can be lost during the upgrade.
     */
    record Hello() implements ServerEvent {}

    record Ready(String userId, String roomId) implements ServerEvent {}

    /** The sender's own message was stored (also for a resend of an already stored one). */
    record Ack(String clientMessageId, Message message) implements ServerEvent {}

    record NewMessage(Message message) implements ServerEvent {}

    /** A friend accepted an invitation to this room (solo → duo). */
    record MemberJoined(String userId, @Nullable String displayName) implements ServerEvent {}

    /** The buddy changed (care, EXP): its state as of now. */
    record BuddyUpdated(BuddyView buddy) implements ServerEvent {}

    /** {@code clientMessageId} is set when a send failed, so the app can mark that message. */
    record Error(String code, @Nullable String clientMessageId) implements ServerEvent {}

    record Pong() implements ServerEvent {}
}
