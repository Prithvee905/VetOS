package com.vetos.platform.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "vetos")
public record VetosProperties(Jwt jwt, Security security, Cors cors, Dev dev, Workers workers, Storage storage, WhatsApp whatsApp, Email email, Platform platform) {

	public VetosProperties {
		if (jwt == null) {
			jwt = new Jwt("dev-only-change-me-not-for-production-0001", Duration.ofMinutes(15), Duration.ofDays(14));
		}
		if (security == null) {
			security = new Security(false);
		}
		if (cors == null) {
			cors = new Cors("http://localhost:3000");
		}
		if (dev == null) {
			dev = new Dev("change-me-now");
		}
		if (workers == null) {
			workers = new Workers(true);
		}
		if (storage == null) {
			storage = new Storage("local", "./.vetos-blobs", null, null);
		}
		if (whatsApp == null) {
			whatsApp = new WhatsApp("", "", "");
		}
		if (email == null) {
			email = new Email("", "noreply@clinic.local", "");
		}
		if (platform == null) {
			platform = new Platform("vetos-platform-admin-secret-change-me");
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

	public record Workers(boolean enabled) {
	}

	public record Storage(String type, String localBasePath, String s3Bucket, String s3Region) {
	}

	public record WhatsApp(String apiBaseUrl, String verifyToken, String accessToken) {
	}

	public record Email(String apiBaseUrl, String fromAddress, String apiKey) {
	}

	public record Platform(String adminSecret) {
	}

}
