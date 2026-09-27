package com.buddychat.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;

class FirebaseJwtValidatorTest {

    private final FirebaseProperties firebase = new FirebaseProperties("buddy-chat-test");
    private final OAuth2TokenValidator<Jwt> validator = FirebaseJwtConfig.firebaseValidator(firebase);

    @Test
    void acceptsTokenForThisProject() {
        assertThat(validator.validate(token(b -> {})).hasErrors()).isFalse();
    }

    @Test
    void rejectsTokenFromAnotherProject() {
        var jwt = token(b -> b.issuer("https://securetoken.google.com/other").audience(List.of("other")));
        assertThat(validator.validate(jwt).hasErrors()).isTrue();
    }

    @Test
    void rejectsWrongAudience() {
        assertThat(validator.validate(token(b -> b.audience(List.of("other")))).hasErrors())
                .isTrue();
    }

    @Test
    void rejectsExpiredToken() {
        var jwt = token(b -> b.issuedAt(Instant.now().minusSeconds(7200))
                .expiresAt(Instant.now().minusSeconds(3600)));
        assertThat(validator.validate(jwt).hasErrors()).isTrue();
    }

    private Jwt token(Consumer<Jwt.Builder> customize) {
        Jwt.Builder builder = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .issuer(firebase.issuer())
                .audience(List.of(firebase.projectId()))
                .subject("uid-1")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600));
        customize.accept(builder);
        return builder.build();
    }
}
