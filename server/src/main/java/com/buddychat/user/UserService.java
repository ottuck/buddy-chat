package com.buddychat.user;

import java.time.Clock;
import java.time.Instant;
import org.jspecify.annotations.Nullable;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

@Service
public class UserService {

    private final UserRepository users;
    private final Clock clock;

    UserService(UserRepository users, Clock clock) {
        this.users = users;
        this.clock = clock;
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
}
