package com.vetos.platform.infrastructure;

import com.vetos.platform.config.VetosProperties;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
public class RedisDistributedLock {

	private final StringRedisTemplate redisTemplate;
	private final boolean enabled;

	public RedisDistributedLock(@Autowired(required = false) StringRedisTemplate redisTemplate, VetosProperties properties) {
		this.redisTemplate = redisTemplate;
		this.enabled = properties.redis() != null && properties.redis().enabled() && redisTemplate != null;
	}

	public boolean tryAcquire(String lockKey, Duration ttl) {
		if (!enabled) {
			return true;
		}
		Boolean acquired = redisTemplate.opsForValue().setIfAbsent(lockKey, "1", ttl);
		return Boolean.TRUE.equals(acquired);
	}

	public void release(String lockKey) {
		if (!enabled) {
			return;
		}
		redisTemplate.delete(lockKey);
	}

}
