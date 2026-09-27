package com.buddychat;

import java.time.Duration;
import java.time.Instant;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import reactor.core.publisher.Mono;

/**
 * Replaces Firebase token verification in tests that send raw tokens (the WebSocket's auth
 * message). A token is {@code "<uid>~<name>"} (bearer tokens allow only a few symbols); anything without a {@code ~} is rejected.
 * Real verification is covered by {@code FirebaseJwtValidatorTest}.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestJwtConfiguration {

    public static String token(String uid) {
        return uid + "~" + uid;
    }

    @Bean
    @Primary
    ReactiveJwtDecoder testJwtDecoder() {
        return token -> {
            // "slow-…" tokens take a while to verify, like the first check that fetches Google's keys.
            Duration delay = token.startsWith("slow-") ? Duration.ofMillis(3500) : Duration.ZERO;
            // "short-…" tokens expire 2 seconds after they are checked.
            Duration lifetime = token.startsWith("short-") ? Duration.ofSeconds(2) : Duration.ofHours(1);
            int bar = token.indexOf('~');
            if (bar < 0) return Mono.error(new BadJwtException("invalid test token"));
            return Mono.just(Jwt.withTokenValue(token)
                            .header("alg", "none")
                            .subject(token.substring(0, bar))
                            .claim("name", token.substring(bar + 1))
                            .issuedAt(Instant.now())
                            .expiresAt(Instant.now().plus(lifetime))
                            .build())
                    .delayElement(delay);
        };
    }
}
