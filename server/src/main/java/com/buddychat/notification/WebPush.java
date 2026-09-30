package com.buddychat.notification;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

/**
 * Sends Web Push messages to browsers (docs/server-design.md, 웹 푸시): the payload encrypted for
 * the subscription (RFC 8291) and the request signed with this server's VAPID key (RFC 8292), then
 * POSTed to the browser's push service. Only known push services are contacted: the endpoint comes
 * from the client.
 */
@Component
class WebPush {

    private static final Logger log = LoggerFactory.getLogger(WebPush.class);
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    // Chrome/Edge (FCM), Firefox, Safari (Apple), Edge on Windows.
    private static final Set<String> PUSH_SERVICES =
            Set.of("fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com");
    private static final Set<String> PUSH_SERVICE_SUFFIXES = Set.of(".push.apple.com", ".notify.windows.com");
    // Undelivered messages are dropped after this long: a chat message a day later is not news.
    private static final Duration TTL = Duration.ofHours(12);

    private final KeyPair vapid;
    private final String subject;
    private final Clock clock;
    private final WebClient http = WebClient.builder().build();
    private final SecureRandom random = new SecureRandom();

    WebPush(NotificationProperties properties, Clock clock) throws GeneralSecurityException {
        this.subject = properties.vapidSubject();
        this.clock = clock;
        if (properties.vapidPublicKey() != null && properties.vapidPrivateKey() != null) {
            this.vapid = WebPushCrypto.keyPair(properties.vapidPrivateKey(), properties.vapidPublicKey());
        } else {
            // Fine locally; in production browsers would have to subscribe again after each restart.
            log.warn("No VAPID keys configured (buddychat.push.vapid-*); using a key for this run only");
            this.vapid = WebPushCrypto.newKeyPair();
        }
    }

    /** The key browsers subscribe with ({@code applicationServerKey}), base64url. */
    String publicKey() {
        return B64.encodeToString(WebPushCrypto.publicKeyBytes((ECPublicKey) vapid.getPublic()));
    }

    static boolean isPushService(String endpoint) {
        try {
            URI uri = URI.create(endpoint);
            String host = uri.getHost();
            return "https".equals(uri.getScheme())
                    && host != null
                    && (PUSH_SERVICES.contains(host)
                            || PUSH_SERVICE_SUFFIXES.stream().anyMatch(host::endsWith));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /** Emits true when the subscription is gone (the user turned notifications off or left). */
    Mono<Boolean> send(PushToken subscription, String payloadJson) {
        if (!isPushService(subscription.token()) || subscription.p256dh() == null || subscription.auth() == null) {
            return Mono.just(true);
        }
        byte[] body;
        String authorization;
        try {
            byte[] salt = new byte[16];
            random.nextBytes(salt);
            body = WebPushCrypto.encrypt(
                    payloadJson.getBytes(StandardCharsets.UTF_8),
                    Base64.getUrlDecoder().decode(subscription.p256dh()),
                    Base64.getUrlDecoder().decode(subscription.auth()),
                    WebPushCrypto.newKeyPair(),
                    salt);
            authorization = "vapid t=" + vapidToken(subscription.token()) + ", k=" + publicKey();
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            log.warn("Could not encrypt a web push message: {}", e.toString());
            return Mono.just(true); // a subscription with broken keys never works
        }
        return http.post()
                .uri(URI.create(subscription.token()))
                .header("Authorization", authorization)
                .header("TTL", String.valueOf(TTL.toSeconds()))
                .header("Urgency", "high")
                .header("Content-Encoding", "aes128gcm")
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .bodyValue(body)
                .exchangeToMono(response -> {
                    int status = response.statusCode().value();
                    if (status == 404 || status == 410)
                        return response.releaseBody().thenReturn(true);
                    if (!response.statusCode().is2xxSuccessful()) {
                        log.warn("Web push was refused: {}", status);
                    }
                    return response.releaseBody().thenReturn(false);
                })
                .timeout(Duration.ofSeconds(10))
                .onErrorResume(e -> {
                    log.warn("Could not send a web push message: {}", e.toString());
                    return Mono.just(false);
                });
    }

    // RFC 8292: an ES256 JWT for the push service's origin.
    private String vapidToken(String endpoint) throws GeneralSecurityException {
        URI uri = URI.create(endpoint);
        String audience = uri.getScheme() + "://" + uri.getHost();
        long expires = clock.instant().plus(Duration.ofHours(12)).getEpochSecond();
        String header = B64.encodeToString("{\"typ\":\"JWT\",\"alg\":\"ES256\"}".getBytes(StandardCharsets.UTF_8));
        String claims = B64.encodeToString(
                ("{\"aud\":\"" + audience + "\",\"exp\":" + expires + ",\"sub\":\"" + subject + "\"}")
                        .getBytes(StandardCharsets.UTF_8));
        Signature signer = Signature.getInstance("SHA256withECDSAinP1363Format");
        signer.initSign((ECPrivateKey) vapid.getPrivate());
        signer.update((header + "." + claims).getBytes(StandardCharsets.US_ASCII));
        return header + "." + claims + "." + B64.encodeToString(signer.sign());
    }
}
