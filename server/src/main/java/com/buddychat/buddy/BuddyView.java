package com.buddychat.buddy;

import java.time.Instant;

/** The buddy as the app shows it, computed at {@code now}. The app does not re-derive the rules. */
public record BuddyView(
        String name,
        int exp,
        int level,
        BuddyRules.Stage stage,
        double levelProgress,
        int fullness,
        int poops,
        boolean hungry,
        boolean canFeed,
        boolean canClean,
        // At the top level: ready to go its own way (BuddyService.graduate).
        boolean grown) {

    public static BuddyView of(Buddy buddy, Instant now) {
        int level = BuddyRules.level(buddy.exp());
        return new BuddyView(
                buddy.name(),
                buddy.exp(),
                level,
                BuddyRules.stage(level),
                BuddyRules.levelProgress(buddy.exp()),
                BuddyRules.fullness(buddy, now),
                BuddyRules.poops(buddy, now),
                BuddyRules.isHungry(buddy, now),
                BuddyRules.canFeed(buddy, now),
                BuddyRules.canClean(buddy, now),
                level == BuddyRules.MAX_LEVEL);
    }
}
