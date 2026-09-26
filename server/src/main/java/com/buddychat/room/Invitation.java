package com.buddychat.room;

import java.time.Instant;
import org.jspecify.annotations.Nullable;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/** A single-use invite code for a room. */
@Document("invitations")
public record Invitation(
        @Id @Nullable String id,
        String roomId,
        String code,
        String createdBy,
        Instant createdAt,
        Instant expiresAt,
        @Nullable Instant usedAt,
        @Nullable String usedBy) {}
