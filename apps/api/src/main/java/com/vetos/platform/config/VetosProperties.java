package com.vetos.platform.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "vetos")
public record VetosProperties(Jwt jwt, Security security, Cors cors, Dev dev) {

	public VetosProperties {
		if (dev == null) {
			dev = new Dev("change-me-now");
		}
	}

	public record Jwt(String secret, Duration accessTtl, Duration refreshTtl) {
	}

	public record Security(boolean cookieSecure) {
	}

	public record Cors(String allowedOrigin) {
	}

	public record Dev(String ownerPassword) {
	}

}
