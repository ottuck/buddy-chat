package com.buddychat.room;

import com.buddychat.buddy.Buddy;
import com.buddychat.buddy.BuddyService;
import com.buddychat.user.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
class RoomController {

    private final UserService userService;
    private final RoomService roomService;
    private final InvitationService invitationService;
    private final BuddyService buddyService;

    RoomController(
            UserService userService,
            RoomService roomService,
            InvitationService invitationService,
            BuddyService buddyService) {
        this.userService = userService;
        this.roomService = roomService;
        this.invitationService = invitationService;
        this.buddyService = buddyService;
    }

    record CreateRoomRequest(
            @NotBlank @Size(max = Buddy.MAX_NAME_LENGTH) String buddyName) {}

    record InvitationResponse(String code, Instant expiresAt) {}

    // Optional in the body; absent means "do not leave my current room".
    record AcceptRequest(@Nullable Boolean leaveCurrentRoom) {}

    @PostMapping("/api/rooms")
    @ResponseStatus(HttpStatus.CREATED)
    Mono<RoomView> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateRoomRequest request) {
        return userService
                .current(jwt)
                .flatMap(user -> roomService.create(user, request.buddyName().strip()));
    }

    @GetMapping("/api/rooms/me")
    Mono<RoomView> mine(@AuthenticationPrincipal Jwt jwt) {
        // Opening the room is when hunger and poops that happened meanwhile get noticed.
        return userService
                .current(jwt)
                .flatMap(roomService::getMine)
                .flatMap(room -> buddyService.observe(room.id()).map(room::withBuddy));
    }

    @PostMapping("/api/rooms/me/invitations")
    @ResponseStatus(HttpStatus.CREATED)
    Mono<InvitationResponse> invite(@AuthenticationPrincipal Jwt jwt) {
        return userService
                .current(jwt)
                .flatMap(invitationService::create)
                .map(invitation -> new InvitationResponse(invitation.code(), invitation.expiresAt()));
    }

    @PostMapping("/api/invitations/{code}/accept")
    Mono<RoomView> accept(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String code,
            @RequestBody(required = false) @Nullable AcceptRequest request) {
        boolean leave = request != null && Boolean.TRUE.equals(request.leaveCurrentRoom());
        return userService.current(jwt).flatMap(user -> invitationService.accept(user, code, leave));
    }
}
