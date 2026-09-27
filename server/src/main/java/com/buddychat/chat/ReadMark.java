package com.buddychat.chat;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * How far a member has read in their room: the newest message id they have seen. Only moves
 * forward. One document per member and room, keyed by both ({@link #key}).
 */
@Document("reads")
record ReadMark(@Id String id, String roomId, String userId, String messageId, Instant updatedAt) {

    static String key(String roomId, String userId) {
        return roomId + ":" + userId;
    }
}
