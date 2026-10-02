package com.buddychat.buddy;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.mongodb.client.result.UpdateResult;
import java.util.List;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.ReactiveMongoTemplate;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

/**
 * Keeps every buddy's level when the EXP per level changes (docs/server-design.md, Buddy 규칙). The
 * level is computed from EXP, so a bigger value would drop existing buddies' levels. At startup,
 * if the value differs from the one recorded last time, every buddy's EXP is scaled by new / old:
 * the level stays and the bar stays about where it was. The first start only records the value.
 * Blocking is fine here: it runs once before the app serves traffic.
 */
@Component
class BuddyExpScale implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BuddyExpScale.class);
    static final String SETTINGS = "settings";
    static final String ID = "buddy";

    record Setting(@Id String id, int expPerLevel) {}

    private final ReactiveMongoTemplate mongo;
    private final int expPerLevel;

    BuddyExpScale(ReactiveMongoTemplate mongo, BuddyProperties properties) {
        this.mongo = mongo;
        this.expPerLevel = properties.expPerLevel();
    }

    @Override
    public void run(ApplicationArguments args) {
        Setting recorded = mongo.findById(ID, Setting.class, SETTINGS).block();
        if (recorded == null) {
            mongo.save(new Setting(ID, expPerLevel), SETTINGS).block();
            return;
        }
        int previous = recorded.expPerLevel();
        if (previous == expPerLevel) return;
        // Record the new value first: if the scaling then fails, levels are lower but never
        // scaled twice. Of two servers starting at once, one does it.
        Setting claimed = mongo.findAndModify(
                        query(where("_id").is(ID).and("expPerLevel").is(previous)),
                        new Update().set("expPerLevel", expPerLevel),
                        Setting.class,
                        SETTINGS)
                .block();
        if (claimed == null) return;
        // exp = floor(exp * new / old), as an int like the rest.
        Document scaled = new Document(
                "$toInt",
                new Document(
                        "$floor",
                        new Document(
                                "$divide",
                                List.of(new Document("$multiply", List.of("$buddy.exp", expPerLevel)), previous))));
        UpdateResult result = mongo.getCollection("rooms")
                .flatMap(rooms -> Mono.from(rooms.updateMany(
                        new Document("buddy.exp", new Document("$gt", 0)),
                        List.of(new Document("$set", new Document("buddy.exp", scaled))))))
                .block();
        log.info(
                "EXP per level {} -> {}: scaled the EXP of {} buddies",
                previous,
                expPerLevel,
                result == null ? 0 : result.getModifiedCount());
    }
}
