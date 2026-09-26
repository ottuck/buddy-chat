package com.buddychat.user;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
class MeController {

    private final UserService userService;

    MeController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/api/me")
    Mono<MeResponse> me(@AuthenticationPrincipal Jwt jwt) {
        // "name" is present for Google/Apple sign-in and absent for anonymous users.
        return userService
                .getOrCreate(jwt.getSubject(), jwt.getClaimAsString("name"))
                .map(MeResponse::from);
    }

    record MeResponse(
            String id,
            @Nullable String displayName,
            @Nullable String roomId) {

        static MeResponse from(User user) {
            return new MeResponse(user.id(), user.displayName(), user.roomId());
        }
    }
}
