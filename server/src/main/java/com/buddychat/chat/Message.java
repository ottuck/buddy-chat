package com.buddychat.chat;

import java.time.Instant;
import org.jspecify.annotations.Nullable;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * A timeline entry. {@code clientMessageId} is always set (server-generated for events the server
 * creates), so {@code roomId + senderId + clientMessageId} can be a plain unique index.
 *
 * @param systemEvent for SYSTEM entries, what happened (e.g. MEMBER_LEFT); {@code text} then holds the
 *     actor's name at the time, since they may no longer be a member. Null on entries stored before.
 */
@Document("messages")
public record Message(
        @Id @Nullable String id,
        String roomId,
        @Nullable String senderId,
        Type type,
        @Nullable String text,
        @Nullable String buddyEvent,
        @Nullable String systemEvent,
        @Nullable String actorId,
        String clientMessageId,
        Instant createdAt) {

    public static final int MAX_TEXT_LENGTH = 2000;

    public enum Type {
        TEXT,
        SYSTEM,
        BUDDY_EVENT
    }

    /** {@code key} makes the event idempotent: recording the same key twice stores it once. */
    static Message buddyEvent(String roomId, String event, @Nullable String actorId, String key, Instant now) {
        return new Message(null, roomId, null, Type.BUDDY_EVENT, null, event, null, actorId, key, now);
    }

    static Message system(
            String roomId, String event, String actorId, @Nullable String actorName, String key, Instant now) {
        return new Message(null, roomId, null, Type.SYSTEM, actorName, null, event, actorId, key, now);
    }

    static Message text(String roomId, String senderId, String clientMessageId, String text, Instant now) {
        return new Message(null, roomId, senderId, Type.TEXT, text, null, null, null, clientMessageId, now);
    }
}
