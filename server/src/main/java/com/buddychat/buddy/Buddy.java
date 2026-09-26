package com.buddychat.buddy;

import java.time.Instant;

/**
 * Buddy state, embedded in its room (docs/server-design.md). Care and growth fields arrive with
 * the buddy milestone (S5).
 */
public record Buddy(String name, int exp, Instant bornAt) {

    public static final int MAX_NAME_LENGTH = 12;

    public static Buddy hatch(String name, Instant now) {
        return new Buddy(name, 0, now);
    }
}
