package com.buddychat.notification;

import com.buddychat.user.UserService;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
class PushTokenController {

    private final NotificationService notifications;
    private final UserService userService;

    PushTokenController(NotificationService notifications, UserService userService) {
        this.notifications = notifications;
        this.userService = userService;
    }

    record RegisterRequest(@Nullable String token) {}

    @PostMapping("/api/me/push-tokens")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    Mono<Void> register(@AuthenticationPrincipal Jwt jwt, @RequestBody RegisterRequest request) {
        return userService.current(jwt).flatMap(user -> notifications.register(user, request.token()));
    }

    @DeleteMapping("/api/me/push-tokens/{token}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    Mono<Void> unregister(@AuthenticationPrincipal Jwt jwt, @PathVariable String token) {
        return userService.current(jwt).flatMap(user -> notifications.unregister(user, token));
    }
}
