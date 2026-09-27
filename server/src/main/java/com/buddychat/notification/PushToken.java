package com.buddychat.notification;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * An Expo push token of one app install. Keyed by the token, so a device that signs in as someone
 * else moves to that user instead of notifying both.
 */
@Document("push_tokens")
record PushToken(@Id String token, String userId, Instant updatedAt) {}
