package com.buddychat.chat;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.buddychat.common.ApiException;
import com.buddychat.user.User;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.bson.types.ObjectId;
import org.jspecify.annotations.Nullable;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
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

    private static ObjectId objectId(String cursor) {
        if (!ObjectId.isValid(cursor)) throw invalid();
        return new ObjectId(cursor);
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST");
    }
}
