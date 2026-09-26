package com.buddychat.room;

import com.buddychat.buddy.Buddy;
import java.time.Instant;
import java.util.List;
import org.jspecify.annotations.Nullable;

/** A room as the app sees it: members resolved to display names. */
public record RoomView(String id, List<Member> members, Buddy buddy, Instant createdAt) {

    public record Member(String id, @Nullable String displayName) {}
}
