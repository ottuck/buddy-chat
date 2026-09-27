package com.buddychat.user;

import java.time.Instant;
import org.jspecify.annotations.Nullable;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * An application user, created on the first authenticated request. {@code firebaseUid} is unique
 * (index created by {@link UserIndexes}).
 */
@Document("users")
public record User(
        @Id @Nullable String id,
        String firebaseUid,
        @Nullable String displayName,
        @Nullable String roomId,
        Instant createdAt) {

    public static final int MAX_NAME_LENGTH = 20;

    static User create(String firebaseUid, @Nullable String displayName, Instant now) {
        return new User(null, firebaseUid, displayName, null, now);
    }
}
