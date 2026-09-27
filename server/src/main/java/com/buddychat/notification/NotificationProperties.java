package com.buddychat.notification;

import java.time.Duration;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * @param expoUrl Expo's push API ({@code /send}, {@code /getReceipts} below it)
 * @param expoAccessToken only needed once "enhanced push security" is turned on for the Expo project
 * @param gracePeriod how long a new message may stay unread before its recipient is notified
 * @param receiptDelay when to ask Expo how delivery went (Expo suggests waiting about 15 minutes)
 */
@ConfigurationProperties("buddychat.push")
record NotificationProperties(
        @DefaultValue("https://exp.host/--/api/v2/push") String expoUrl,
        @Nullable String expoAccessToken,
        @DefaultValue("3s") Duration gracePeriod,
        @DefaultValue("15m") Duration receiptDelay) {}
