package com.buddychat.buddy;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * @param expPerLevel EXP for one level. Lowered while testing so evolutions come after a few
 *     messages (env {@code BUDDYCHAT_BUDDY_EXPPERLEVEL}); the real value is the default.
 */
@ConfigurationProperties("buddychat.buddy")
record BuddyProperties(@DefaultValue("20") int expPerLevel) {}
