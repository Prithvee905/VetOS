package com.vetos.platform.infrastructure;

import com.vetos.platform.config.VetosProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.Order;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(5)
public class LoginRateLimitFilter extends OncePerRequestFilter {

	private final StringRedisTemplate redisTemplate;
	private final boolean enabled;

	public LoginRateLimitFilter(@Autowired(required = false) StringRedisTemplate redisTemplate, VetosProperties properties) {
		this.redisTemplate = redisTemplate;
		this.enabled = properties.redis() != null && properties.redis().enabled() && redisTemplate != null;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
			throws ServletException, IOException {
		if (enabled && "POST".equalsIgnoreCase(request.getMethod()) && request.getRequestURI().endsWith("/api/v1/auth/login")) {
			String ip = request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
			String key = "ratelimit:login:" + ip;
			Long count = redisTemplate.opsForValue().increment(key);
			if (count != null && count == 1L) {
				redisTemplate.expire(key, Duration.ofMinutes(1));
			}
			if (count != null && count > 30) {
				response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
				response.setContentType("application/json");
				response.getWriter().write("{\"code\":\"RATE_LIMITED\",\"message\":\"Too many login attempts. Try again later.\"}");
				return;
			}
		}
		filterChain.doFilter(request, response);
	}

}
