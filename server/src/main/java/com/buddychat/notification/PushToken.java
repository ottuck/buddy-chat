package com.buddychat.notification;

import java.time.Instant;
import org.jspecify.annotations.Nullable;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * Where to notify one device: an Expo push token of an app install, or a browser's Web Push
 * subscription (its endpoint URL as the token, with the keys to encrypt for it). Keyed by the
 * token, so a device that signs in as someone else moves to that user instead of notifying both.
 *
 * @param p256dh for Web Push: the browser's public key; null for Expo tokens
 * @param auth for Web Push: the browser's authentication secret; null for Expo tokens
 */
@Document("push_tokens")
record PushToken(
        @Id String token,
        String userId,
        Instant updatedAt,
        @Nullable String p256dh,
        @Nullable String auth) {

    boolean isWeb() {
        return p256dh != null;
    }
}
