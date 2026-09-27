package com.buddychat.auth;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("buddychat.firebase")
public record FirebaseProperties(@NotBlank String projectId) {

    public String issuer() {
        return "https://securetoken.google.com/" + projectId;
    }
}
