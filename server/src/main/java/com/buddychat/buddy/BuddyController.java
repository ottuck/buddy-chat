package com.buddychat.buddy;

import com.buddychat.common.ApiException;
import com.buddychat.user.User;
import com.buddychat.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.function.BiFunction;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
class BuddyController {

    private final UserService userService;
    private final BuddyService buddyService;

    BuddyController(UserService userService, BuddyService buddyService) {
        this.userService = userService;
        this.buddyService = buddyService;
    }

    // 200 either way: "changed: false" means it was not needed (or the other member just did it).
    @PostMapping("/api/rooms/me/buddy/feed")
    Mono<BuddyService.CareResult> feed(@AuthenticationPrincipal Jwt jwt) {
        return inMyRoom(jwt, buddyService::feed);
    }

    @PostMapping("/api/rooms/me/buddy/clean")
    Mono<BuddyService.CareResult> clean(@AuthenticationPrincipal Jwt jwt) {
        return inMyRoom(jwt, buddyService::clean);
    }

    record GraduateRequest(
            @NotBlank @Size(max = Buddy.MAX_NAME_LENGTH) String buddyName) {}

    // At the top level: the buddy goes into the album and a new egg with this name arrives.
    @PostMapping("/api/rooms/me/buddy/graduate")
    Mono<BuddyView> graduate(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody GraduateRequest request) {
        return userService
                .current(jwt)
                .flatMap((User user) -> user.roomId() == null
                        ? Mono.error(new ApiException(HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND"))
                        : buddyService.graduate(
                                user.roomId(), user.id(), request.buddyName().strip()));
    }

    private Mono<BuddyService.CareResult> inMyRoom(
            Jwt jwt, BiFunction<String, String, Mono<BuddyService.CareResult>> action) {
        return userService
                .current(jwt)
                .flatMap((User user) -> user.roomId() == null
                        ? Mono.error(new ApiException(HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND"))
                        : action.apply(user.roomId(), user.id()));
    }
}
