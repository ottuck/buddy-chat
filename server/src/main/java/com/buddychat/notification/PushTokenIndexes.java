package com.buddychat.notification;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.stereotype.Component;

/** See {@code UserIndexes} for why indexes are created explicitly at startup. */
@Component
class PushTokenIndexes implements ApplicationRunner {

    private final ReactiveMongoTemplate mongo;

    PushTokenIndexes(ReactiveMongoTemplate mongo) {
        this.mongo = mongo;
    }

    @Override
    public void run(ApplicationArguments args) {
        // The devices of the members being notified.
        mongo.indexOps(PushToken.class)
                .createIndex(new Index().on("userId", Sort.Direction.ASC))
                .block();
    }
}
