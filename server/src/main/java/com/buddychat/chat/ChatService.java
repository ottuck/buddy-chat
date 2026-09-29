package com.buddychat.chat;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.buddychat.common.ApiException;
import com.buddychat.user.User;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.bson.types.ObjectId;
import org.jspecify.annotations.Nullable;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

@Service
public class ChatService {

    public static final int MAX_PAGE_SIZE = 50;
    private static final int MAX_CLIENT_MESSAGE_ID_LENGTH = 64;

    private final MessageRepository messages;
    private final ReactiveMongoTemplate mongo;
    private final Clock clock;

    ChatService(MessageRepository messages, ReactiveMongoTemplate mongo, Clock clock) {
        this.messages = messages;
        this.mongo = mongo;
        this.clock = clock;
    }

    /** {@code created} is false when this was a resend of an already stored message. */
    public record SendResult(Message message, boolean created) {}

    public record MessagePage(List<Message> messages, boolean hasMore) {}

    /**
     * Stores a text message in the sender's room. Sending the same {@code clientMessageId} again
     * (a retry after a dropped connection) returns the stored message instead of a duplicate.
     */
    public Mono<SendResult> send(User sender, String clientMessageId, String rawText) {
        String roomId = sender.roomId();
        if (roomId == null) return Mono.error(new ApiException(HttpStatus.CONFLICT, "ROOM_NOT_FOUND"));
        String text = rawText == null ? "" : rawText.strip();
        if (clientMessageId == null
                || clientMessageId.isBlank()
                || clientMessageId.length() > MAX_CLIENT_MESSAGE_ID_LENGTH
                || text.isEmpty()
                || text.length() > Message.MAX_TEXT_LENGTH) {
            return Mono.error(new ApiException(HttpStatus.BAD_REQUEST, "INVALID_MESSAGE"));
        }
        Message message = Message.text(roomId, sender.id(), clientMessageId, text, Instant.now(clock));
        return messages.insert(message)
                .map(saved -> new SendResult(saved, true))
                .onErrorResume(
                        DuplicateKeyException.class,
                        e -> messages.findByRoomIdAndSenderIdAndClientMessageId(roomId, sender.id(), clientMessageId)
                                .map(existing -> new SendResult(existing, false)));
    }

    /**
     * Adds a buddy event (fed, pooped, …) to a room's timeline. Emits the message only when it is
     * new; a key recorded before (e.g. the same poop noticed again) completes empty.
     */
    public Mono<Message> recordBuddyEvent(String roomId, String event, @Nullable String actorId, String key) {
        return recordBuddyEvent(roomId, event, null, actorId, key);
    }

    /** As above, with a detail kept in {@code text} (the new level for LEVELED_UP). */
    public Mono<Message> recordBuddyEvent(
            String roomId, String event, @Nullable String detail, @Nullable String actorId, String key) {
        return messages.insert(Message.buddyEvent(roomId, event, detail, actorId, key, Instant.now(clock)))
                .onErrorResume(DuplicateKeyException.class, e -> Mono.empty());
    }

    /** Adds a system entry (e.g. a member left) to a room's timeline. */
    public Mono<Message> recordSystemEvent(String roomId, String event, String actorId, @Nullable String actorName) {
        Instant now = Instant.now(clock);
        String key = "system:" + event + ":" + actorId + ":" + now.toEpochMilli();
        return messages.insert(Message.system(roomId, event, actorId, actorName, key, now));
    }

    /** Removes a deleted room's timeline and read marks. */
    public Mono<Void> deleteRoomHistory(String roomId) {
        return Mono.when(
                mongo.remove(query(where("roomId").is(roomId)), Message.class),
                mongo.remove(query(where("roomId").is(roomId)), ReadMark.class));
    }

    /** Removes how far the user has read, in any room (account deletion). */
    public Mono<Void> deleteReadMarksOf(String userId) {
        return mongo.remove(query(where("userId").is(userId)), ReadMark.class).then();
    }

    /**
     * A page of the user's room timeline, newest first. {@code before} pages back through history;
     * {@code after} fetches what was missed while disconnected (repeat while {@code hasMore}).
     */
    public Mono<MessagePage> history(User user, @Nullable String before, @Nullable String after, int limit) {
        String roomId = user.roomId();
        if (roomId == null) return Mono.error(new ApiException(HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND"));
        if (limit < 1 || limit > MAX_PAGE_SIZE || (before != null && after != null)) return Mono.error(invalid());
        Criteria criteria = where("roomId").is(roomId);
        Sort sort = Sort.by(Sort.Direction.DESC, "_id");
        if (before != null) {
            criteria = criteria.and("_id").lt(objectId(before));
        } else if (after != null) {
            // Oldest missed messages first, so repeated calls walk forward without gaps.
            criteria = criteria.and("_id").gt(objectId(after));
            sort = Sort.by(Sort.Direction.ASC, "_id");
        }
        boolean forward = after != null;
        return mongo.find(query(criteria).with(sort).limit(limit + 1), Message.class)
                .collectList()
                .map(found -> {
                    boolean hasMore = found.size() > limit;
                    List<Message> page = hasMore ? found.subList(0, limit) : found;
                    return new MessagePage(forward ? page.reversed() : page, hasMore);
                });
    }

    /**
     * Records that the user has read their room up to {@code messageId}. Emits true when that moved
     * their read mark forward, false when it was already there or further (an older or repeated
     * read, or a race with another of their devices).
     */
    public Mono<Boolean> markRead(User user, String messageId) {
        String roomId = user.roomId();
        if (roomId == null) return Mono.error(new ApiException(HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND"));
        if (messageId == null || !ObjectId.isValid(messageId)) return Mono.error(invalid());
        String id = ReadMark.key(roomId, user.id());
        return mongo.exists(
                        query(where("_id")
                                .is(new ObjectId(messageId))
                                .and("roomId")
                                .is(roomId)),
                        Message.class)
                .flatMap(exists -> {
                    if (!exists) return Mono.error(invalid());
                    // Only an older mark matches (ids compare in timeline order). With no match the
                    // upsert tries to insert the same _id and hits a duplicate key. That means the
                    // mark exists, but not that it is newer: concurrent first reads race to create it,
                    // and an older one may have won. So try once more against the existing mark.
                    Query older = query(where("_id").is(id).and("messageId").lt(messageId));
                    Update mark = new Update()
                            .set("roomId", roomId)
                            .set("userId", user.id())
                            .set("messageId", messageId)
                            .set("updatedAt", Instant.now(clock));
                    return mongo.upsert(older, mark, ReadMark.class)
                            .thenReturn(true)
                            .onErrorResume(
                                    DuplicateKeyException.class,
                                    e -> mongo.updateFirst(older, mark, ReadMark.class)
                                            .map(result -> result.getModifiedCount() == 1));
                });
    }

    /** Each member's read mark in the room: user id → newest message id they have read. */
    public Mono<Map<String, String>> readMarks(String roomId) {
        return mongo.find(query(where("roomId").is(roomId)), ReadMark.class)
                .collectMap(ReadMark::userId, ReadMark::messageId);
    }

    private static ObjectId objectId(String cursor) {
        if (!ObjectId.isValid(cursor)) throw invalid();
        return new ObjectId(cursor);
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
    }
}
