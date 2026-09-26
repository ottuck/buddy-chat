package com.buddychat.realtime;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/** Messages the app sends over the WebSocket (docs/server-design.md, "WebSocket 프로토콜"). */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
    @JsonSubTypes.Type(value = ClientEvent.Auth.class, name = "auth"),
    @JsonSubTypes.Type(value = ClientEvent.Send.class, name = "send"),
    @JsonSubTypes.Type(value = ClientEvent.Ping.class, name = "ping"),
})
sealed interface ClientEvent {

    record Auth(String token) implements ClientEvent {}

    record Send(String clientMessageId, String text) implements ClientEvent {}

    record Ping() implements ClientEvent {}
}
