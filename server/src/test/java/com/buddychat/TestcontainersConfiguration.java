package com.buddychat;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.mongodb.MongoDBContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * A throwaway MongoDB for tests. Given {@code SPRING_MONGODB_URI} (and a separate
 * {@code SPRING_MONGODB_DATABASE}), the same tests run against that server instead, e.g. Azure
 * DocumentDB to check compatibility. They delete every document in that database.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    @ConditionalOnExpression("'${spring.mongodb.uri:}' == ''")
    MongoDBContainer mongoDbContainer() {
        return new MongoDBContainer(DockerImageName.parse("mongo:8.0"));
    }
}
