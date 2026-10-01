package com.vetos.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.vetos.ApiIntegrationTest;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;

@AutoConfigureMockMvc
class AuthFlowTest extends ApiIntegrationTest {

	private static final String PASSWORD = "correct-horse";

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private TransactionTemplate transactionTemplate;

	@Autowired
	private TenantTransactionSupport tenantTransactionSupport;

	@Autowired
	private PasswordEncoder passwordEncoder;

	private UUID clinicId;
	private UUID branchId;
	private String email;

	@BeforeEach
	void seedOwner() {
		clinicId = UuidV7.generate();
		branchId = UuidV7.generate();
		email = "auth-" + clinicId + "@clinic.test";
		UUID userId = UuidV7.generate();
		String hash = passwordEncoder.encode(PASSWORD);
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name) values (?, ?)", clinicId, "Auth Clinic");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, "Front");
			jdbcTemplate.update("""
					insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
					values (?, ?, ?, ?, ?, ?)
					""", userId, clinicId, branchId, email, hash, "Auth Owner");
			jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, 'OWNER', ?)", userId, clinicId);
		});
	}

	@Test
	void loginRefreshReuseAndTenantBranchList() throws Exception {
		mockMvc.perform(post("/api/v1/auth/login")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"email":"missing@clinic.test","password":"correct-horse"}
								"""))
				.andExpect(status().isUnauthorized())
				.andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
				.andExpect(jsonPath("$.requestId").isNotEmpty());

		MvcResult login = mockMvc.perform(post("/api/v1/auth/login")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"email":"%s","password":"%s"}
								""".formatted(email, PASSWORD)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.clinicId").value(clinicId.toString()))
				.andExpect(jsonPath("$.roles[0]").value("OWNER"))
				.andReturn();

		String access = cookie(login, "vetos_access");
		String refresh = cookie(login, "vetos_refresh");
		assertThat(access).isNotBlank();
		assertThat(refresh).isNotBlank();

		mockMvc.perform(get("/api/v1/auth/me").cookie(new Cookie("vetos_access", access)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.displayName").value("Auth Owner"));

		mockMvc.perform(get("/api/v1/branches").cookie(new Cookie("vetos_access", access)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].name").value("Front"))
				.andExpect(jsonPath("$.items[1]").doesNotExist());

		MvcResult rotated = mockMvc.perform(post("/api/v1/auth/refresh")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.cookie(new Cookie("vetos_refresh", refresh)))
				.andExpect(status().isOk())
				.andReturn();
		String nextRefresh = cookie(rotated, "vetos_refresh");
		assertThat(nextRefresh).isNotEqualTo(refresh);

		mockMvc.perform(post("/api/v1/auth/refresh")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.cookie(new Cookie("vetos_refresh", refresh)))
				.andExpect(status().isUnauthorized());

		mockMvc.perform(post("/api/v1/auth/refresh")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.cookie(new Cookie("vetos_refresh", nextRefresh)))
				.andExpect(status().isUnauthorized());

		mockMvc.perform(post("/api/v1/auth/logout")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.cookie(new Cookie("vetos_access", access), new Cookie("vetos_refresh", nextRefresh)))
				.andExpect(status().isNoContent());
	}

	@Test
	void locksAccountAfterRepeatedFailures() throws Exception {
		String body = """
				{"email":"%s","password":"wrong-password"}
				""".formatted(email);
		for (int attempt = 0; attempt < 5; attempt++) {
			mockMvc.perform(post("/api/v1/auth/login")
							.with(SecurityMockMvcRequestPostProcessors.csrf())
							.contentType(MediaType.APPLICATION_JSON)
							.content(body))
					.andExpect(status().isUnauthorized());
		}
		mockMvc.perform(post("/api/v1/auth/login")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"email":"%s","password":"%s"}
								""".formatted(email, PASSWORD)))
				.andExpect(status().isUnauthorized());
	}

	private static String cookie(MvcResult result, String name) {
		return result.getResponse().getHeaders("Set-Cookie").stream()
				.filter(header -> header.startsWith(name + "="))
				.map(header -> header.substring(name.length() + 1, header.indexOf(';')))
				.findFirst()
				.orElseThrow();
	}

}
