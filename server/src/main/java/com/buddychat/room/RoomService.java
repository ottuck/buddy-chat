package com.buddychat.room;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.buddychat.buddy.Buddy;
import com.buddychat.buddy.BuddyView;
import com.buddychat.common.ApiException;
import com.buddychat.user.User;
import com.buddychat.user.UserService;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.bson.types.ObjectId;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

@Service
public class RoomService {

    private final RoomRepository rooms;
    private final UserService userService;
    private final ReactiveMongoTemplate mongo;
    private final Clock clock;

    RoomService(RoomRepository rooms, UserService userService, ReactiveMongoTemplate mongo, Clock clock) {
        this.rooms = rooms;
        this.userService = userService;
        this.mongo = mongo;
        this.clock = clock;
    }

    /**
     * Creates the user's solo room with a new egg. The user's room is claimed first with a
     * conditional update, so two concurrent requests cannot create two rooms.
     */
    public Mono<RoomView> create(User user, String buddyName) {
        if (user.roomId() != null) return Mono.error(roomAlreadyExists());
        String roomId = new ObjectId().toHexString();
        Instant now = Instant.now(clock);
        return userService
                .assignRoomIfNone(user.id(), roomId)
                .flatMap(claimed -> claimed
                        ? rooms.insert(Room.solo(roomId, user.id(), Buddy.hatch(buddyName, now), now))
                        : Mono.error(roomAlreadyExists()))
                .flatMap(this::toView);
    }

    /** Who is in the room (empty if it no longer exists). */
    public Mono<List<String>> memberIds(String roomId) {
        return rooms.findById(roomId).map(Room::memberIds);
    }

    public Mono<RoomView> getMine(User user) {
        return findMine(user).flatMap(this::toView);
    }

    Mono<Room> findMine(User user) {
        if (user.roomId() == null) return Mono.error(roomNotFound());
        return rooms.findById(user.roomId()).switchIfEmpty(Mono.error(roomNotFound()));
    }

    Mono<Room> findById(String roomId) {
        return rooms.findById(roomId).switchIfEmpty(Mono.error(roomNotFound()));
    }

    /**
     * Adds a member in one conditional update: only if the room still has a free slot and the
     * user is not already in it. Of any number of concurrent joins, at most the free slots succeed.
     * A user who is already a member counts as joined (an earlier accept got this far, then failed).
     */
    Mono<Boolean> join(String roomId, String userId) {
        return mongo.updateFirst(
                        query(where("_id")
                                .is(roomId)
                                .and("memberCount")
                                .lt(Room.MAX_MEMBERS)
                                .and("memberIds")
                                .ne(userId)),
                        new Update().push("memberIds", userId).inc("memberCount", 1),
                        Room.class)
                .flatMap(result -> result.getModifiedCount() == 1
                        ? Mono.just(true)
                        : mongo.exists(
                                query(where("_id").is(roomId).and("memberIds").is(userId)), Room.class));
    }

    /** Deletes a room only while the given user is still its only member. */
    Mono<Void> deleteIfSolo(String roomId, String userId) {
        return mongo.remove(
                        query(where("_id")
                                .is(roomId)
                                .and("memberCount")
                                .is(1)
                                .and("memberIds")
                                .is(List.of(userId))),
                        Room.class)
                .then();
    }

    Mono<RoomView> toView(Room room) {
        return userService
                .findAllById(room.memberIds())
                .collectMap(User::id, Function.identity())
                .map(byId -> new RoomView(
                        room.id(),
                        members(room, byId),
                        BuddyView.of(room.buddy(), Instant.now(clock)),
                        room.createdAt()));
    }

    // Keeps join order (the room's creator first).
    private static List<RoomView.Member> members(Room room, Map<String, User> byId) {
        return room.memberIds().stream()
                .map(id -> new RoomView.Member(
                        id, byId.containsKey(id) ? byId.get(id).displayName() : null))
                .toList();
    }

    private static ApiException roomAlreadyExists() {
        return new ApiException(HttpStatus.CONFLICT, "ROOM_ALREADY_EXISTS");
    }

    private static ApiException roomNotFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND");
    }
}
