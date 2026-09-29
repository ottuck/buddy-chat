package com.buddychat.account;

import com.buddychat.user.UserService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

/**
 * Once a week, deletes guests that can never come back (docs/server-design.md, 게스트 정리).
 * Firebase deletes anonymous accounts 30 days after they were created, but their user, room and
 * messages stay on the server. A guest is deleted here like an account deleted in the app
 * ({@link AccountService}): a partner keeps the room and the buddy.
 *
 * <p>Two conditions, so a guest is never deleted while still using the app: created more than 30
 * days ago (Firebase has deleted them by then), and not seen for a week (in case Firebase is late).
 * A guest who linked an account is no longer a guest from their next request on. Users from before
 * the guest flag existed are never cleaned up; there were only a few, during testing.
 */
@Component
class GuestCleanup {

    private static final Logger log = LoggerFactory.getLogger(GuestCleanup.class);
    static final Duration GUEST_LIFETIME = Duration.ofDays(30);
    static final Duration IDLE = Duration.ofDays(7);

    private final UserService userService;
    private final AccountService accountService;
    private final Clock clock;

    GuestCleanup(UserService userService, AccountService accountService, Clock clock) {
        this.userService = userService;
        this.accountService = accountService;
        this.clock = clock;
    }

    // Monday 04:00 in Japan, when hardly anyone is chatting. One replica runs the server; if two
    // overlap during a deploy, deleting twice is harmless.
    @Scheduled(cron = "0 0 4 * * MON", zone = "Asia/Tokyo")
    void weekly() {
        run().subscribe(
                        count -> log.info("Guest clean-up: deleted {} guest(s) Firebase no longer has", count),
                        e -> log.warn("Guest clean-up failed; it runs again next week", e));
    }

    /** Deletes the guests that are gone, one after another. Emits how many. */
    Mono<Long> run() {
        Instant now = Instant.now(clock);
        return userService
                .findIdleGuests(now.minus(GUEST_LIFETIME), now.minus(IDLE))
                .concatMap(user -> accountService.delete(user).thenReturn(user))
                .count();
    }
}
