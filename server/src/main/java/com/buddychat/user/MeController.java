package com.buddychat.user;

import org.jspecify.annotations.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
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
        return userService.current(jwt).map(MeResponse::from);
    }

    record UpdateRequest(@Nullable String displayName) {}

    @PatchMapping("/api/me")
    Mono<MeResponse> update(@AuthenticationPrincipal Jwt jwt, @RequestBody UpdateRequest request) {
        return userService
                .current(jwt)
                .flatMap(user -> userService.rename(user, request.displayName()))
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
