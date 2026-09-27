package com.buddychat.notification;

import java.util.List;
import java.util.Map;
import reactor.core.publisher.Mono;

/** Delivers notifications through a push service. Replaced in tests. */
interface PushSender {

    /**
     * @param invalidTokens tokens the service rejected right away as no longer valid
     * @param pending receipt id → token, for sends whose outcome is known only later
     */
    record Sent(List<String> invalidTokens, Map<String, String> pending) {}

    Mono<Sent> send(List<PushMessage> messages);

    /** The tokens among {@code pending} (receipt id → token) whose delivery showed they are no longer valid. */
    Mono<List<String>> invalidTokens(Map<String, String> pending);
}
