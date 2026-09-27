package com.buddychat.realtime;

import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.HandlerMapping;
import org.springframework.web.reactive.handler.SimpleUrlHandlerMapping;

@Configuration(proxyBeanMethods = false)
class WebSocketConfig {

    @Bean
    HandlerMapping webSocketMapping(ChatWebSocketHandler handler) {
        // Ahead of the annotated controllers.
        return new SimpleUrlHandlerMapping(Map.of("/ws", handler), -1);
    }
}
