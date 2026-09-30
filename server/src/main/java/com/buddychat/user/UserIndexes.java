package com.buddychat.user;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.stereotype.Component;

/**
 * Creates indexes explicitly at startup instead of relying on auto index creation, so what exists
 * in production (MongoDB Atlas) is visible in code. Blocking is fine here: it runs once before
 * the app serves traffic.
 */
@Component
class UserIndexes implements ApplicationRunner {

    private final ReactiveMongoTemplate mongo;

    UserIndexes(ReactiveMongoTemplate mongo) {
        this.mongo = mongo;
    }

    @Override
    public void run(ApplicationArguments args) {
        mongo.indexOps(User.class)
                .createIndex(new Index("firebaseUid", Sort.Direction.ASC).unique())
                .block();
    }
}
