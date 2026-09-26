package com.buddychat.chat;

import com.buddychat.user.UserService;
import org.jspecify.annotations.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/** Timeline history. Sending goes through the WebSocket (see realtime). */
@RestController
class MessageController {

    private final UserService userService;
    private final ChatService chatService;

    MessageController(UserService userService, ChatService chatService) {
        this.userService = userService;
        this.chatService = chatService;
    }

    @GetMapping("/api/rooms/me/messages")
    Mono<ChatService.MessagePage> history(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) @Nullable String before,
            @RequestParam(required = false) @Nullable String after,
            @RequestParam(defaultValue = "30") int limit) {
        // Only the caller's own room is reachable, so another room's messages cannot be read.
        return userService.current(jwt).flatMap(user -> chatService.history(user, before, after, limit));
    }
}
