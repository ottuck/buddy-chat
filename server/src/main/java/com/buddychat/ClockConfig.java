package com.buddychat;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class ClockConfig {

    // Injected so tests can control time (buddy state is computed from timestamps).
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
