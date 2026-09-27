package com.buddychat.buddy;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * Buddy state, embedded in its room (docs/server-design.md). Only timestamps are stored; hunger
 * and poop are computed from them when read ({@link BuddyRules}), so no scheduler is needed.
 *
 * @param lastFedAt null on rooms created before care existed; treated as {@code bornAt}
 * @param lastCleanedAt null on rooms created before care existed; treated as {@code bornAt}
 * @param expDay the day (Asia/Tokyo) {@code messageExpToday} counts for
 * @param messageExpToday null on rooms created before the daily cap existed
 */
public record Buddy(
        String name,
        int exp,
        Instant bornAt,
        @Nullable Instant lastFedAt,
        @Nullable Instant lastCleanedAt,
        @Nullable String expDay,
        @Nullable Integer messageExpToday) {

    public static final int MAX_NAME_LENGTH = 12;

    public static Buddy hatch(String name, Instant now) {
        return new Buddy(name, 0, now, now, now, null, 0);
    }

    Instant fedAt() {
        return lastFedAt != null ? lastFedAt : bornAt;
    }

    Instant cleanedAt() {
        return lastCleanedAt != null ? lastCleanedAt : bornAt;
    }
}
