package com.buddychat.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.reactive.server.SecurityMockServerConfigurers.mockJwt;

import com.buddychat.TestcontainersConfiguration;
import com.buddychat.user.User;
import com.buddychat.user.UserService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webtestclient.autoconfigure.AutoConfigureWebTestClient;
import org.springframework.context.annotation.Import;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.reactive.server.EntityExchangeResult;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;

@SpringBootTest
@AutoConfigureWebTestClient
@Import(TestcontainersConfiguration.class)
class RoomFlowTest {

    @Autowired
    WebTestClient client;

    @Autowired
    ReactiveMongoTemplate mongo;

    @Autowired
    RoomRepository rooms;

    @Autowired
    InvitationRepository invitations;

    @Autowired
    UserService userService;

    record Error(String code) {}

    record Invite(String code, Instant expiresAt) {}

    @BeforeEach
    void clean() {
        // Keeps the indexes created at startup; only the documents go.
        Flux.just(Room.class, Invitation.class, User.class)
                .flatMap(type -> mongo.remove(new Query(), type))
                .blockLast();
    }

    @Test
    void createsSoloRoomWithAnEgg() {
        RoomView room = createRoom("henry", "Mugi");

        assertThat(room.members()).extracting(RoomView.Member::displayName).containsExactly("henry");
        assertThat(room.buddy().name()).isEqualTo("Mugi");
        assertThat(room.buddy().exp()).isZero();
        assertThat(get("henry", "/api/rooms/me")
                        .expectBody(RoomView.class)
                        .returnResult()
                        .getResponseBody()
                        .id())
                .isEqualTo(room.id());
    }

    @Test
    void userCannotCreateASecondRoom() {
        createRoom("henry", "Mugi");
        assertError(
                post("henry", "/api/rooms", Map.of("buddyName", "Mochi")), HttpStatus.CONFLICT, "ROOM_ALREADY_EXISTS");
    }

    @Test
    void concurrentCreatesLeaveExactlyOneRoom() {
        userService.getOrCreate("henry", "henry").block(); // user exists before the race
        List<Integer> statuses = race(
                6,
                i -> post("henry", "/api/rooms", Map.of("buddyName", "Mugi"))
                        .returnResult(Void.class)
                        .getStatus()
                        .value());

        assertThat(statuses).containsOnlyOnce(201);
        assertThat(rooms.count().block()).isEqualTo(1);
    }

    @Test
    void rejectsBlankOrLongBuddyName() {
        assertError(post("henry", "/api/rooms", Map.of("buddyName", " ")), HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
        assertError(
                post("henry", "/api/rooms", Map.of("buddyName", "x".repeat(13))),
                HttpStatus.BAD_REQUEST,
                "INVALID_REQUEST");
    }

    @Test
    void roomNotFoundBeforeCreating() {
        assertError(get("henry", "/api/rooms/me"), HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND");
    }

    @Test
    void friendJoinsWithInviteCode() {
        RoomView created = createRoom("henry", "Mugi");
        String code = invite("henry");

        RoomView joined = accept("yuki", code, false)
                .expectStatus()
                .isOk()
                .expectBody(RoomView.class)
                .returnResult()
                .getResponseBody();

        assertThat(joined.id()).isEqualTo(created.id());
        assertThat(joined.members()).extracting(RoomView.Member::displayName).containsExactly("henry", "yuki");
        assertThat(joined.buddy().name()).isEqualTo("Mugi"); // the buddy carries over from solo to duo
    }

    @Test
    void codeIsCaseInsensitive() {
        createRoom("henry", "Mugi");
        accept("yuki", invite("henry").toLowerCase(), false).expectStatus().isOk();
    }

    @Test
    void invitationIsSingleUse() {
        createRoom("henry", "Mugi");
        String code = invite("henry");
        accept("yuki", code, false).expectStatus().isOk();

        assertError(accept("mika", code, false), HttpStatus.GONE, "INVITATION_USED");
    }

    @Test
    void cannotInviteIntoFullRoom() {
        createRoom("henry", "Mugi");
        accept("yuki", invite("henry"), false).expectStatus().isOk();

        assertError(post("henry", "/api/rooms/me/invitations", null), HttpStatus.CONFLICT, "ROOM_FULL");
    }

    @Test
    void unknownAndExpiredCodesAreRejected() {
        RoomView room = createRoom("henry", "Mugi");
        Instant past = Instant.now().minusSeconds(60);
        invitations
                .insert(new Invitation(null, room.id(), "EXPIRED2", "x", past.minusSeconds(60), past, null, null))
                .block();

        assertError(accept("yuki", "NOPE2345", false), HttpStatus.NOT_FOUND, "INVITATION_NOT_FOUND");
        assertError(accept("yuki", "EXPIRED2", false), HttpStatus.GONE, "INVITATION_EXPIRED");
    }

    @Test
    void memberCannotAcceptOwnRoomInvitation() {
        createRoom("henry", "Mugi");
        assertError(accept("henry", invite("henry"), false), HttpStatus.CONFLICT, "ALREADY_MEMBER");
    }

    @Test
    void leavingOwnSoloRoomNeedsConfirmationAndDeletesIt() {
        createRoom("henry", "Mugi");
        RoomView yukisRoom = createRoom("yuki", "Pico");
        String code = invite("henry");

        assertError(accept("yuki", code, false), HttpStatus.CONFLICT, "LEAVE_CONFIRMATION_REQUIRED");
        accept("yuki", code, true).expectStatus().isOk();

        assertThat(rooms.existsById(yukisRoom.id()).block()).isFalse();
        assertThat(rooms.count().block()).isEqualTo(1);
    }

    @Test
    void acceptThatFailedAfterJoiningCanBeFinishedByAcceptingAgain() {
        RoomView henrysRoom = createRoom("henry", "Mugi");
        RoomView yukisRoom = createRoom("yuki", "Pico");
        String code = invite("henry");
        // State left by an accept that failed right after joining: the code is used and yuki
        // holds the last slot, but yuki's user still points at the old room.
        String yuki = userId("yuki");
        mongo.updateFirst(
                        Query.query(Criteria.where("code").is(code)),
                        new Update().set("usedAt", Instant.now()).set("usedBy", yuki),
                        Invitation.class)
                .block();
        mongo.updateFirst(
                        Query.query(Criteria.where("_id").is(henrysRoom.id())),
                        new Update().push("memberIds", yuki).inc("memberCount", 1),
                        Room.class)
                .block();

        RoomView joined = accept("yuki", code, true)
                .expectStatus()
                .isOk()
                .expectBody(RoomView.class)
                .returnResult()
                .getResponseBody();

        assertThat(joined.id()).isEqualTo(henrysRoom.id());
        assertThat(joined.members()).extracting(RoomView.Member::displayName).containsExactly("henry", "yuki");
        assertThat(rooms.findById(henrysRoom.id()).block().memberCount()).isEqualTo(2);
        assertThat(rooms.existsById(yukisRoom.id()).block()).isFalse();
        assertThat(get("yuki", "/api/rooms/me")
                        .expectStatus()
                        .isOk()
                        .expectBody(RoomView.class)
                        .returnResult()
                        .getResponseBody()
                        .id())
                .isEqualTo(henrysRoom.id());
        // Still single use for anyone else.
        assertError(accept("mika", code, false), HttpStatus.GONE, "INVITATION_USED");
    }

    @Test
    void acceptThatFailedAfterMovingSucceedsWhenAcceptedAgain() {
        RoomView henrysRoom = createRoom("henry", "Mugi");
        String code = invite("henry");
        accept("yuki", code, false).expectStatus().isOk();

        // A retry whose first attempt actually finished (e.g. the response was lost).
        accept("yuki", code, false).expectStatus().isOk();

        assertThat(rooms.findById(henrysRoom.id()).block().memberCount()).isEqualTo(2);
    }

    @Test
    void memberOfADuoRoomCannotJoinAnother() {
        createRoom("henry", "Mugi");
        accept("yuki", invite("henry"), false).expectStatus().isOk();
        createRoom("mika", "Pico");

        assertError(accept("yuki", invite("mika"), true), HttpStatus.CONFLICT, "ALREADY_IN_ROOM");
    }

    @Test
    void concurrentAcceptsOfTheSameCodeLetOnlyOneIn() {
        RoomView room = createRoom("henry", "Mugi");
        String code = invite("henry");

        List<Integer> statuses = race(
                6,
                i -> accept("friend-" + i, code, false)
                        .returnResult(Void.class)
                        .getStatus()
                        .value());

        assertThat(statuses).containsOnlyOnce(200);
        assertThat(rooms.findById(room.id()).block().memberCount()).isEqualTo(2);
    }

    @Test
    void concurrentAcceptsOfDifferentCodesForTheLastSlotLetOnlyOneIn() {
        RoomView room = createRoom("henry", "Mugi");
        List<String> codes =
                List.of(invite("henry"), invite("henry"), invite("henry"), invite("henry"), invite("henry"));

        List<Integer> statuses = race(
                codes.size(),
                i -> accept("friend-" + i, codes.get(i), false)
                        .returnResult(Void.class)
                        .getStatus()
                        .value());

        assertThat(statuses).containsOnlyOnce(200);
        Room after = rooms.findById(room.id()).block();
        assertThat(after.memberCount()).isEqualTo(2);
        assertThat(after.memberIds()).hasSize(2);
        // Losers got their invitation back rather than burning it.
        Map<Boolean, Long> usedCounts = invitations
                .findAll()
                .collect(Collectors.partitioningBy(inv -> inv.usedAt() != null, Collectors.counting()))
                .block();
        assertThat(usedCounts.get(true)).isEqualTo(1);
    }

    // --- helpers ---

    private String userId(String uid) {
        return mongo.findOne(Query.query(Criteria.where("firebaseUid").is(uid)), User.class)
                .block()
                .id();
    }

    private RoomView createRoom(String uid, String buddyName) {
        return post(uid, "/api/rooms", Map.of("buddyName", buddyName))
                .expectStatus()
                .isCreated()
                .expectBody(RoomView.class)
                .returnResult()
                .getResponseBody();
    }

    private String invite(String uid) {
        return post(uid, "/api/rooms/me/invitations", null)
                .expectStatus()
                .isCreated()
                .expectBody(Invite.class)
                .returnResult()
                .getResponseBody()
                .code();
    }

    private WebTestClient.ResponseSpec accept(String uid, String code, boolean leave) {
        return post(uid, "/api/invitations/" + code + "/accept", Map.of("leaveCurrentRoom", leave));
    }

    private WebTestClient.ResponseSpec get(String uid, String path) {
        return as(uid).get().uri(path).exchange();
    }

    private WebTestClient.ResponseSpec post(String uid, String path, Object body) {
        var request = as(uid).post().uri(path);
        return (body == null ? request : request.bodyValue(body)).exchange();
    }

    // The uid doubles as the display name so assertions can read member names.
    private WebTestClient as(String uid) {
        return client.mutateWith(mockJwt().jwt(jwt -> jwt.subject(uid).claim("name", uid)));
    }

    private static void assertError(WebTestClient.ResponseSpec response, HttpStatus status, String code) {
        EntityExchangeResult<Error> result = response.expectStatus()
                .isEqualTo(status)
                .expectBody(Error.class)
                .returnResult();
        assertThat(result.getResponseBody().code()).isEqualTo(code);
    }

    private static <T> List<T> race(int n, Function<Integer, T> call) {
        return Flux.range(0, n)
                .parallel(n)
                .runOn(Schedulers.boundedElastic())
                .map(call)
                .sequential()
                .collectList()
                .block();
    }
}
