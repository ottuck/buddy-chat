package com.buddychat.user;

import java.time.Instant;
import org.jspecify.annotations.Nullable;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * An application user, created on the first authenticated request. {@code firebaseUid} is unique
 * (index created by {@link UserIndexes}).
 *
 * @param guest signed in anonymously with no account linked, as of the last request. Null on users
 *     not seen since this was added.
 * @param lastSeenAt the last authenticated request, kept to the day ({@link UserService#current}).
 *     Null on users not seen since this was added.
 */
@Document("users")
public record User(
        @Id @Nullable String id,
        String firebaseUid,
        @Nullable String displayName,
        @Nullable String roomId,
        Instant createdAt,
        @Nullable Boolean guest,
        @Nullable Instant lastSeenAt) {

    public static final int MAX_NAME_LENGTH = 20;

    static User create(String firebaseUid, @Nullable String displayName, boolean guest, Instant now) {
        return new User(null, firebaseUid, displayName, null, now, guest, now);
    }
}
