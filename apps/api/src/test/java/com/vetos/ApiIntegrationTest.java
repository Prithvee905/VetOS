package com.vetos;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.time.Duration;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;

@SpringBootTest
@ActiveProfiles("test")
public abstract class ApiIntegrationTest {

	static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17")
			.withStartupTimeout(Duration.ofMinutes(3));

	static {
		POSTGRES.start();
		ensureAppRole();
	}

	private static void ensureAppRole() {
		try {
			POSTGRES.copyFileToContainer(
					MountableFile.forClasspathResource("db/test-init.sql"),
					"/docker-entrypoint-initdb.d/zz-vetos-app-role.sql");
			POSTGRES.execInContainer(
					"psql",
					"-U",
					POSTGRES.getUsername(),
					"-d",
					POSTGRES.getDatabaseName(),
					"-v",
					"ON_ERROR_STOP=1",
					"-f",
					"/docker-entrypoint-initdb.d/zz-vetos-app-role.sql");
		}
		catch (Exception exception) {
			throw new IllegalStateException("Failed to create vetos_app role for tests", exception);
		}
	}

	private static String jdbcUrlUtc() {
		return POSTGRES.getJdbcUrl() + "&options=-c%20TimeZone%3DUTC";
	}

	@DynamicPropertySource
	static void databaseProperties(DynamicPropertyRegistry registry) {
		registry.add("spring.datasource.url", ApiIntegrationTest::jdbcUrlUtc);
		registry.add("spring.datasource.username", () -> "vetos_app");
		registry.add("spring.datasource.password", () -> "vetos_app");
		registry.add("spring.flyway.url", ApiIntegrationTest::jdbcUrlUtc);
		registry.add("spring.flyway.user", POSTGRES::getUsername);
		registry.add("spring.flyway.password", POSTGRES::getPassword);
	}

}
