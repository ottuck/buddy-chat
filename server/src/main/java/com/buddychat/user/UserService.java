package com.buddychat.user;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.buddychat.common.ApiException;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import org.jspecify.annotations.Nullable;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class UserService {

    private final UserRepository users;
    private final ReactiveMongoTemplate mongo;
    private final Clock clock;

    UserService(UserRepository users, ReactiveMongoTemplate mongo, Clock clock) {
        this.users = users;
        this.mongo = mongo;
        this.clock = clock;
    }

    /** The signed-in user, identified only by the token's subject (Firebase uid). */
    public Mono<User> current(Jwt jwt) {
        // "name" is present for Google/Apple sign-in and absent for anonymous users.
        return getOrCreate(jwt.getSubject(), jwt.getClaimAsString("name"));
    }

    /**
     * Returns the user for a Firebase uid, creating it on first sign-in. Two concurrent first
     * requests may both try to insert; the unique index lets one win and the other re-reads it.
     */
    public Mono<User> getOrCreate(String firebaseUid, @Nullable String displayName) {
        return users.findByFirebaseUid(firebaseUid)
                .switchIfEmpty(Mono.defer(() -> users.save(User.create(firebaseUid, displayName, Instant.now(clock)))))
                .onErrorResume(DuplicateKeyException.class, e -> users.findByFirebaseUid(firebaseUid));
    }

    public Flux<User> findAllById(Collection<String> ids) {
        return users.findAllById(ids);
    }

    /**
     * Sets the user's room only if they have none yet. Returns false if another request got
     * there first, so a user never ends up owning two rooms.
     */
    public Mono<Boolean> assignRoomIfNone(String userId, String roomId) {
        return mongo.updateFirst(
                        query(where("_id").is(userId).and("roomId").is(null)),
                        Update.update("roomId", roomId),
                        User.class)
                .map(result -> result.getModifiedCount() == 1);
    }

    /**
     * Sets the name others see. Guests (anonymous sign-in) start without one; signing in with
     * Google only fills it in on the first request, so a name chosen here stays.
     */
    public Mono<User> rename(User user, @Nullable String rawName) {
        String name = rawName == null ? "" : rawName.strip();
        if (name.isEmpty() || name.codePointCount(0, name.length()) > User.MAX_NAME_LENGTH) {
            return Mono.error(new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST"));
        }
        return mongo.findAndModify(
                query(where("_id").is(user.id())),
                Update.update("displayName", name),
                FindAndModifyOptions.options().returnNew(true),
                User.class);
    }

    /** Clears the user's room, only if it is still that room (leaving twice is harmless). */
    public Mono<Void> leaveRoom(String userId, String roomId) {
        return mongo.updateFirst(
                        query(where("_id").is(userId).and("roomId").is(roomId)),
                        new Update().unset("roomId"),
                        User.class)
                .then();
    }

    public Mono<Void> moveToRoom(String userId, String roomId) {
        return mongo.updateFirst(query(where("_id").is(userId)), Update.update("roomId", roomId), User.class)
                .then();
    }
}
