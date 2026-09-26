package com.buddychat.room;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.stereotype.Component;

/** See {@code UserIndexes} for why indexes are created explicitly at startup. */
@Component
class RoomIndexes implements ApplicationRunner {

    private final ReactiveMongoTemplate mongo;

    RoomIndexes(ReactiveMongoTemplate mongo) {
        this.mongo = mongo;
    }

    @Override
    public void run(ApplicationArguments args) {
        mongo.indexOps(Invitation.class)
                .createIndex(new Index("code", Sort.Direction.ASC).unique())
                .block();
    }
}
