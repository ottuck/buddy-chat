package com.buddychat.buddy;

import java.time.Instant;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * Buddy state, embedded in its room (docs/server-design.md). Only timestamps are stored; hunger
 * and poop are computed from them when read ({@link BuddyRules}), so no scheduler is needed.
 *
 * @param lastFedAt null on rooms created before care existed; treated as {@code bornAt}
 * @param lastCleanedAt when the floor was last clean; poops since then are counted from it. Null on
 *     rooms created before care existed; treated as {@code bornAt}
 * @param poopsCleaned poops tapped away one by one since {@code lastCleanedAt}; null means none
 * @param expDay the day (Asia/Tokyo) {@code messageExpToday} counts for
 * @param messageExpToday null on rooms created before the daily cap existed
 * @param talkDay the day (Asia/Tokyo) {@code talkers} counts for; null until the first message
 * @param talkers members who sent a message on {@code talkDay}
 * @param togetherDay the last day both members talked (and the buddy got the bonus for it)
 */
public record Buddy(
        String name,
        int exp,
        Instant bornAt,
        @Nullable Instant lastFedAt,
        @Nullable Instant lastCleanedAt,
        @Nullable String expDay,
        @Nullable Integer messageExpToday,
        @Nullable Integer poopsCleaned,
        @Nullable String talkDay,
        @Nullable List<String> talkers,
        @Nullable String togetherDay) {

    public static final int MAX_NAME_LENGTH = 12;

    public static Buddy hatch(String name, Instant now) {
        return new Buddy(name, 0, now, now, now, null, 0, 0, null, null, null);
    }

    Instant fedAt() {
        return lastFedAt != null ? lastFedAt : bornAt;
    }

    Instant cleanedAt() {
        return lastCleanedAt != null ? lastCleanedAt : bornAt;
    }

    int cleaned() {
        return poopsCleaned != null ? poopsCleaned : 0;
    }

    /** The egg that takes this grown buddy's place. Today's talk carries over: one bonus a day. */
    Buddy next(String name, Instant now) {
        return new Buddy(name, 0, now, now, now, null, 0, 0, talkDay, talkers, togetherDay);
    }

    /** Members who sent a message on that day. */
    List<String> talkedOn(String day) {
        return day.equals(talkDay) && talkers != null ? talkers : List.of();
    }
}
