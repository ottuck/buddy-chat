package com.buddychat.auth;

import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;

/**
 * Verifies Firebase ID tokens as plain JWTs: Google's public keys, the project's issuer and audience.
 * Non-blocking, unlike the Firebase Admin SDK's verifyIdToken (docs/server-design.md).
 */
@Configuration(proxyBeanMethods = false)
class FirebaseJwtConfig {

    static final String JWK_SET_URI =
            "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

    @Bean
    ReactiveJwtDecoder jwtDecoder(FirebaseProperties firebase) {
        NimbusReactiveJwtDecoder decoder =
                NimbusReactiveJwtDecoder.withJwkSetUri(JWK_SET_URI).build();
        decoder.setJwtValidator(firebaseValidator(firebase));
        return decoder;
    }

    static OAuth2TokenValidator<Jwt> firebaseValidator(FirebaseProperties firebase) {
        return new DelegatingOAuth2TokenValidator<>(
                // Expiry (with clock skew) and issuer.
                JwtValidators.createDefaultWithIssuer(firebase.issuer()),
                new JwtClaimValidator<List<String>>("aud", aud -> aud != null && aud.contains(firebase.projectId())),
                new JwtClaimValidator<String>("sub", sub -> sub != null && !sub.isBlank()));
    }
}
