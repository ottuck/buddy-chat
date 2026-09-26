package com.buddychat.realtime;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * @param authTimeout how long a new connection may take to send its {@code auth} message
 * @param pingInterval WebSocket ping frames keep idle connections open through Azure Container
 *     Apps' idle timeout (docs/review-notes.md §4)
 */
@ConfigurationProperties("buddychat.realtime")
record RealtimeProperties(
        @DefaultValue("5s") Duration authTimeout,
        @DefaultValue("25s") Duration pingInterval) {}
