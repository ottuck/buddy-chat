package com.buddychat.buddy;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Growth and care rules. The numbers are placeholders until tuned (docs/server-design.md, Buddy 규칙). The
 * buddy never dies: neglect only makes it hungry and dirty (docs/product.md).
 */
public final class BuddyRules {

    public static final int DEFAULT_EXP_PER_LEVEL = 20;
    // Set once at startup from BuddyProperties (lowered while testing evolutions).
    private static volatile int expPerLevel = DEFAULT_EXP_PER_LEVEL;
    public static final int FEED_EXP = 2;
    public static final int CLEAN_EXP = 2;
    public static final int MESSAGE_EXP = 1;
    // Stops "ㅎ ㅎ ㅎ" spam from levelling the buddy.
    public static final int MESSAGE_EXP_DAILY_CAP = 50;

    // Fullness drops from 100 to 0 over this long after a meal (2.5 h: feedable again after 30
    // minutes, hungry after 1 h 45 min). Set from BuddyProperties.
    private static volatile Duration fullToEmpty = Duration.ofMinutes(150);
    static final int FEEDABLE_BELOW = 80;
    static final int HUNGRY_AT = 30;
    // One poop per this long since the last clean, up to MAX_POOPS. Set from BuddyProperties.
    private static volatile Duration poopEvery = Duration.ofHours(1);
    static final int MAX_POOPS = 3;
    // "Today" for the daily EXP cap; the app is for users in Japan first.
    static final ZoneId DAY_ZONE = ZoneId.of("Asia/Tokyo");

    public enum Stage {
        EGG,
        BABY,
        CHILD,
        ADULT
    }

    private BuddyRules() {}

    public static int expPerLevel() {
        return expPerLevel;
    }

    static void useTiming(Duration fullToEmptyValue, Duration poopEveryValue) {
        if (fullToEmptyValue.isNegative()
                || fullToEmptyValue.isZero()
                || poopEveryValue.isNegative()
                || poopEveryValue.isZero()) {
            throw new IllegalArgumentException("Buddy durations must be positive");
        }
        fullToEmpty = fullToEmptyValue;
        poopEvery = poopEveryValue;
    }

    /** How long after a meal the buddy is hungry. */
    public static Duration hungryAfter() {
        return fullToEmpty.multipliedBy(100 - HUNGRY_AT).dividedBy(100);
    }

    public static Duration poopEvery() {
        return poopEvery;
    }

    static void useExpPerLevel(int value) {
        if (value < 1) throw new IllegalArgumentException("EXP per level must be at least 1");
        expPerLevel = value;
    }

    // The highest level (docs/product.md, 최고 레벨). EXP keeps counting past it.
    public static final int MAX_LEVEL = 30;

    public static int level(int exp) {
        return Math.min(MAX_LEVEL, exp / expPerLevel + 1);
    }

    /** The EXP a level starts at. */
    static int minExp(int level) {
        return (level - 1) * expPerLevel;
    }

    /** How far into the current level, 0..1; full at the highest level. */
    public static double levelProgress(int exp) {
        if (level(exp) == MAX_LEVEL) return 1;
        return (exp % expPerLevel) / (double) expPerLevel;
    }

    public static Stage stage(int level) {
        if (level >= 10) return Stage.ADULT;
        if (level >= 5) return Stage.CHILD;
        if (level >= 2) return Stage.BABY;
        return Stage.EGG;
    }

    public static int fullness(Buddy buddy, Instant now) {
        long elapsed = Duration.between(buddy.fedAt(), now).toMillis();
        long drop = elapsed * 100 / fullToEmpty.toMillis();
        return (int) Math.max(0, 100 - drop);
    }

    /** Poops made since the floor was last clean (the first MAX_POOPS count), cleaned or not. */
    static int poopsMade(Buddy buddy, Instant now) {
        long count = Duration.between(buddy.cleanedAt(), now).dividedBy(poopEvery);
        return (int) Math.min(MAX_POOPS, Math.max(0, count));
    }

    /** Poops on the floor: made, less those tapped away. */
    public static int poops(Buddy buddy, Instant now) {
        return Math.max(0, poopsMade(buddy, now) - buddy.cleaned());
    }

    public static boolean canFeed(Buddy buddy, Instant now) {
        return fullness(buddy, now) < FEEDABLE_BELOW;
    }

    public static boolean canClean(Buddy buddy, Instant now) {
        return poops(buddy, now) > 0;
    }

    public static boolean isHungry(Buddy buddy, Instant now) {
        return fullness(buddy, now) <= HUNGRY_AT;
    }

    /** Feeding is allowed when the last meal was before this (the query form of canFeed). */
    static Instant feedableIfFedBefore(Instant now) {
        return now.minus(fullToEmpty.multipliedBy(100 - FEEDABLE_BELOW).dividedBy(100));
    }

    static String day(Instant now) {
        return LocalDate.ofInstant(now, DAY_ZONE).toString();
    }
}
