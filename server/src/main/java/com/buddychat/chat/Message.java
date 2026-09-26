package com.buddychat.chat;

import java.time.Instant;
import org.jspecify.annotations.Nullable;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * A timeline entry. {@code clientMessageId} is always set (server-generated for events the server
 * creates), so {@code roomId + senderId + clientMessageId} can be a plain unique index.
 */
@Document("messages")
public record Message(
        @Id @Nullable String id,
        String roomId,
        @Nullable String senderId,
        Type type,
        @Nullable String text,
        @Nullable String buddyEvent,
        @Nullable String actorId,
        String clientMessageId,
        Instant createdAt) {

    public static final int MAX_TEXT_LENGTH = 2000;

    public enum Type {
        TEXT,
        SYSTEM,
        BUDDY_EVENT
    }

    static Message text(String roomId, String senderId, String clientMessageId, String text, Instant now) {
        return new Message(null, roomId, senderId, Type.TEXT, text, null, null, clientMessageId, now);
    }
}
