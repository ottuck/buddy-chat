package com.buddychat.realtime;

import com.buddychat.chat.Message;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import org.jspecify.annotations.Nullable;

/** Messages the server sends over the WebSocket. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = ServerEvent.Ready.class, name = "ready"),
    @JsonSubTypes.Type(value = ServerEvent.Ack.class, name = "ack"),
    @JsonSubTypes.Type(value = ServerEvent.NewMessage.class, name = "message"),
    @JsonSubTypes.Type(value = ServerEvent.Error.class, name = "error"),
    @JsonSubTypes.Type(value = ServerEvent.Pong.class, name = "pong"),
})
public sealed interface ServerEvent {

    record Ready(String userId, String roomId) implements ServerEvent {}

    /** The sender's own message was stored (also for a resend of an already stored one). */
    record Ack(String clientMessageId, Message message) implements ServerEvent {}

    record NewMessage(Message message) implements ServerEvent {}

    /** {@code clientMessageId} is set when a send failed, so the app can mark that message. */
    record Error(String code, @Nullable String clientMessageId) implements ServerEvent {}

    record Pong() implements ServerEvent {}
}
