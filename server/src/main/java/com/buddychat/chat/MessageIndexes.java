package com.buddychat.chat;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

/** See {@code UserIndexes} for why indexes are created explicitly at startup. */
@Component
class MessageIndexes implements ApplicationRunner {

    private final ReactiveMongoTemplate mongo;

    MessageIndexes(ReactiveMongoTemplate mongo) {
        this.mongo = mongo;
    }

    @Override
    public void run(ApplicationArguments args) {
        var ops = mongo.indexOps(Message.class);
        Mono.when(
                        // History pages: newest first within a room.
                        ops.createIndex(
                                new Index().on("roomId", Sort.Direction.ASC).on("_id", Sort.Direction.DESC)),
                        // A resent message (same clientMessageId) is stored once.
                        ops.createIndex(new Index()
                                .on("roomId", Sort.Direction.ASC)
                                .on("senderId", Sort.Direction.ASC)
                                .on("clientMessageId", Sort.Direction.ASC)
                                .unique()))
                .block();
    }
}
