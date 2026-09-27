package com.buddychat.room;

import com.buddychat.buddy.BuddyView;
import java.time.Instant;
import java.util.List;
import org.jspecify.annotations.Nullable;

/** A room as the app sees it: members resolved to display names. */
public record RoomView(String id, List<Member> members, BuddyView buddy, Instant createdAt) {

    public RoomView withBuddy(BuddyView buddy) {
        return new RoomView(id, members, buddy, createdAt);
    }

    public record Member(String id, @Nullable String displayName) {}
}
