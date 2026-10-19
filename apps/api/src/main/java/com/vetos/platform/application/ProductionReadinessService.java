package com.vetos.platform.application;

import com.vetos.platform.config.VetosProperties;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

@Service
public class ProductionReadinessService {

	private final VetosProperties properties;
	private final Environment environment;

	public ProductionReadinessService(VetosProperties properties, Environment environment) {
		this.properties = properties;
		this.environment = environment;
	}

	public Map<String, Object> gates() {
		Map<String, Object> gates = new LinkedHashMap<>();
		gates.put("phase14_offlineSyncApi", true);
		gates.put("phase15_copilotAdvisory", true);
		gates.put("phase17_securityReview", Map.of(
				"redisRateLimitConfigured", properties.redis() != null && properties.redis().enabled(),
				"cookieSecure", properties.security() != null && properties.security().cookieSecure()));
		gates.put("phase18_productionReview", Map.of(
				"workersEnabled", properties.workers() != null && properties.workers().enabled(),
				"storageType", properties.storage() == null ? "local" : properties.storage().type(),
				"activeProfiles", environment.getActiveProfiles()));
		gates.put("manualGatesPending", Arrays.asList(
				"Penetration test evidence",
				"Load test report",
				"Backup restore drill log"));
		return gates;
	}

}
