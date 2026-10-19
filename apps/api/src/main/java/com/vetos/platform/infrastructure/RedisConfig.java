package com.vetos.platform.infrastructure;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(name = "vetos.redis.enabled", havingValue = "true")
public class RedisConfig {
}
