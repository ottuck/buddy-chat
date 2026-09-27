package com.buddychat.notification;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

/**
 * Sends through Expo's push service, which hands iOS notifications to APNs (and Android ones to
 * FCM). Expo answers each message with a ticket; errors from APNs show up later in a receipt. Either
 * one saying DeviceNotRegistered means the app was uninstalled or the token went stale.
 */
@Component
class ExpoPushSender implements PushSender {

    private static final Logger log = LoggerFactory.getLogger(ExpoPushSender.class);
    private static final String NOT_REGISTERED = "DeviceNotRegistered";

    private final WebClient client;

    ExpoPushSender(NotificationProperties properties) {
        WebClient.Builder configured = WebClient.builder().baseUrl(properties.expoUrl());
        if (properties.expoAccessToken() != null) {
            configured.defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.expoAccessToken());
        }
        this.client = configured.build();
    }

    /** A ticket (id set when accepted) or a receipt (no id). */
    record Outcome(
            @Nullable String status,
            @Nullable String id,
            @Nullable String message,
            @Nullable Details details) {

        boolean notRegistered() {
            return "error".equals(status) && details != null && NOT_REGISTERED.equals(details.error());
        }

        @Nullable
        String error() {
            return details != null ? details.error() : null;
        }
    }

    record Details(@Nullable String error) {}

    record Tickets(@Nullable List<Outcome> data) {}

    record Receipts(@Nullable Map<String, Outcome> data) {}

    @Override
    public Mono<Sent> send(List<PushMessage> messages) {
        if (messages.isEmpty()) return Mono.just(new Sent(List.of(), Map.of()));
        return client.post()
                .uri("/send")
                .bodyValue(messages)
                .retrieve()
                .bodyToMono(Tickets.class)
                .map(response -> {
                    List<String> invalid = new ArrayList<>();
                    Map<String, String> pending = new HashMap<>();
                    List<Outcome> tickets = response.data() != null ? response.data() : List.of();
                    // Tickets come back in the order the messages were sent.
                    for (int i = 0; i < tickets.size() && i < messages.size(); i++) {
                        Outcome ticket = tickets.get(i);
                        String token = messages.get(i).to();
                        if ("ok".equals(ticket.status()) && ticket.id() != null) {
                            pending.put(ticket.id(), token);
                        } else if (ticket.notRegistered()) {
                            invalid.add(token);
                        } else {
                            log.warn("Push not accepted: {} {}", ticket.error(), ticket.message());
                        }
                    }
                    return new Sent(invalid, pending);
                });
    }

    @Override
    public Mono<List<String>> invalidTokens(Map<String, String> pending) {
        if (pending.isEmpty()) return Mono.just(List.of());
        return client.post()
                .uri("/getReceipts")
                .bodyValue(Map.of("ids", pending.keySet()))
                .retrieve()
                .bodyToMono(Receipts.class)
                .map(response -> {
                    List<String> invalid = new ArrayList<>();
                    Map<String, Outcome> receipts = response.data() != null ? response.data() : Map.of();
                    receipts.forEach((id, receipt) -> {
                        if (receipt.notRegistered() && pending.containsKey(id)) {
                            invalid.add(pending.get(id));
                        } else if ("error".equals(receipt.status())) {
                            log.warn("Push not delivered: {} {}", receipt.error(), receipt.message());
                        }
                    });
                    return invalid;
                });
    }
}
