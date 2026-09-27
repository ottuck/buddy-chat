package com.buddychat.room;

import com.buddychat.buddy.Buddy;
import java.time.Instant;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * A room of one or two members sharing one buddy. {@code memberCount} mirrors
 * {@code memberIds.size()} so "at most two" can be enforced by one conditional update.
 */
@Document("rooms")
public record Room(@Id String id, List<String> memberIds, int memberCount, Buddy buddy, Instant createdAt) {

    public static final int MAX_MEMBERS = 2;

    static Room solo(String id, String ownerId, Buddy buddy, Instant now) {
        return new Room(id, List.of(ownerId), 1, buddy, now);
    }

    boolean isFull() {
        return memberCount >= MAX_MEMBERS;
    }
}
