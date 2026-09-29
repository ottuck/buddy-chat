package com.buddychat.buddy;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * @param expPerLevel EXP for one level. Lowered while testing so evolutions come after a few
 *     messages (env {@code BUDDYCHAT_BUDDY_EXPPERLEVEL}); the real value is the default.
 * @param fullToEmpty how long fullness takes to drop from 100 to 0 after a meal. Feeding is allowed
 *     again after a fifth of it, hunger comes after 70 % (docs/server-design.md, Buddy 규칙).
 * @param poopEvery one poop per this long since the last clean.
 */
@ConfigurationProperties("buddychat.buddy")
record BuddyProperties(
        @DefaultValue("20") int expPerLevel,
        @DefaultValue("150m") Duration fullToEmpty,
        @DefaultValue("1h") Duration poopEvery) {}
