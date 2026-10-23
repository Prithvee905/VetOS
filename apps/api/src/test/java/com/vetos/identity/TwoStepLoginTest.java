package com.vetos.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.ApiIntegrationTest;
import com.vetos.identity.application.Totp;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
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
class TwoStepLoginTest extends ApiIntegrationTest {

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

	private final ObjectMapper objectMapper = new ObjectMapper();

	private UUID clinicId;
	private String ownerEmail;
	private String doctorEmail;

	@BeforeEach
	void seed() {
		clinicId = UuidV7.generate();
		UUID branchId = UuidV7.generate();
		ownerEmail = "owner-" + clinicId + "@clinic.test";
		doctorEmail = "doctor-" + clinicId + "@clinic.test";
		String hash = passwordEncoder.encode(PASSWORD);
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name) values (?, ?)", clinicId, "Two Step Clinic");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, "Main");
			for (String[] user : new String[][] { { ownerEmail, "OWNER" }, { doctorEmail, "DOCTOR" } }) {
				UUID userId = UuidV7.generate();
				jdbcTemplate.update("""
						insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
						values (?, ?, ?, ?, ?, ?)
						""", userId, clinicId, branchId, user[0], hash, user[1]);
				jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, ?, ?)", userId, user[1], clinicId);
			}
		});
	}

	@Test
	void authenticatorCodeIsNeededAfterSetupAndCannotBeReplayed() throws Exception {
		String token = accessToken(passwordLogin(ownerEmail));
		JsonNode setup = json(mockMvc.perform(post("/api/v1/auth/two-step/setup").cookie(access(token)).with(csrf()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.qrSvg").value(org.hamcrest.Matchers.startsWith("<svg")))
				.andReturn());
		String secret = setup.get("secret").asText();
		long now = Instant.now().getEpochSecond();

		JsonNode enabled = json(mockMvc.perform(post("/api/v1/auth/two-step/enable").cookie(access(token)).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"code\":\"" + Totp.codeFor(secret, now) + "\"}"))
				.andExpect(status().isOk())
				.andReturn());
		assertThat(enabled.get("recoveryCodes")).hasSize(8);
		String recoveryCode = enabled.get("recoveryCodes").get(0).asText();

		// Password alone no longer signs in: a challenge comes back and no session cookie is set.
		MvcResult login = passwordLogin(ownerEmail);
		JsonNode challenge = json(login);
		assertThat(challenge.get("twoStepRequired").asBoolean()).isTrue();
		assertThat(login.getResponse().getHeaders("Set-Cookie")).noneMatch(h -> h.startsWith("vetos_access="));
		String challengeToken = challenge.get("challengeToken").asText();

		// The code already used to turn it on is refused; the next one works.
		twoStepLogin(challengeToken, Totp.codeFor(secret, now)).andExpect(status().isUnauthorized());
		MvcResult ok = twoStepLogin(challengeToken, Totp.codeFor(secret, now + 30)).andExpect(status().isOk()).andReturn();
		mockMvc.perform(get("/api/v1/auth/two-step").cookie(access(accessToken(ok))))
				.andExpect(jsonPath("$.enabled").value(true))
				.andExpect(jsonPath("$.recoveryCodesLeft").value(8));

		// A recovery code works once.
		String second = json(passwordLogin(ownerEmail)).get("challengeToken").asText();
		twoStepLogin(second, recoveryCode).andExpect(status().isOk());
		twoStepLogin(second, recoveryCode).andExpect(status().isUnauthorized());
	}

	@Test
	void clinicRequirementBlocksTheAppUntilTheDoctorSetsItUp() throws Exception {
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("update clinics set require_two_step = true where id = ?", clinicId);
		});
		MvcResult login = passwordLogin(doctorEmail);
		assertThat(json(login).get("twoStepSetupRequired").asBoolean()).isTrue();
		String token = accessToken(login);

		mockMvc.perform(get("/api/v1/patients").cookie(access(token)))
				.andExpect(status().isForbidden())
				.andExpect(jsonPath("$.code").value("TWO_STEP_SETUP_REQUIRED"));
		mockMvc.perform(get("/api/v1/auth/two-step").cookie(access(token)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.required").value(true));

		String secret = json(mockMvc.perform(post("/api/v1/auth/two-step/setup").cookie(access(token)).with(csrf())).andReturn())
				.get("secret").asText();
		mockMvc.perform(post("/api/v1/auth/two-step/enable").cookie(access(token)).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"code\":\"" + Totp.codeFor(secret, Instant.now().getEpochSecond()) + "\"}"))
				.andExpect(status().isOk());

		// After setup, signing in with password + code gives full access.
		String challenge = json(passwordLogin(doctorEmail)).get("challengeToken").asText();
		MvcResult ok = twoStepLogin(challenge, Totp.codeFor(secret, Instant.now().getEpochSecond() + 30)).andExpect(status().isOk()).andReturn();
		mockMvc.perform(get("/api/v1/patients").cookie(access(accessToken(ok)))).andExpect(status().isOk());
	}

	@Test
	void wrongCodesLockTheAccountAndOwnerCanResetALostPhone() throws Exception {
		String doctorToken = accessToken(passwordLogin(doctorEmail));
		String secret = json(mockMvc.perform(post("/api/v1/auth/two-step/setup").cookie(access(doctorToken)).with(csrf())).andReturn())
				.get("secret").asText();
		mockMvc.perform(post("/api/v1/auth/two-step/enable").cookie(access(doctorToken)).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"code\":\"" + Totp.codeFor(secret, Instant.now().getEpochSecond()) + "\"}"))
				.andExpect(status().isOk());

		String challenge = json(passwordLogin(doctorEmail)).get("challengeToken").asText();
		for (int i = 0; i < 5; i++) {
			twoStepLogin(challenge, "000000").andExpect(status().isUnauthorized());
		}
		// Locked: even the right code is refused now.
		twoStepLogin(challenge, Totp.codeFor(secret, Instant.now().getEpochSecond() + 30)).andExpect(status().isUnauthorized());

		UUID doctorId = transactionTemplate.execute(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("update users set locked_until = null, failed_login_count = 0 where lower(email) = lower(?)", doctorEmail);
			return jdbcTemplate.queryForObject("select id from users where lower(email) = lower(?)", UUID.class, doctorEmail);
		});
		String ownerToken = accessToken(passwordLogin(ownerEmail));
		mockMvc.perform(post("/api/v1/users/" + doctorId + "/two-step/reset").cookie(access(ownerToken)).with(csrf()))
				.andExpect(status().isNoContent());
		// After the reset the doctor signs in with the password only.
		assertThat(accessToken(passwordLogin(doctorEmail))).isNotBlank();
	}

	private MvcResult passwordLogin(String email) throws Exception {
		return mockMvc.perform(post("/api/v1/auth/login").with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}"))
				.andExpect(status().isOk())
				.andReturn();
	}

	private org.springframework.test.web.servlet.ResultActions twoStepLogin(String challenge, String code) throws Exception {
		return mockMvc.perform(post("/api/v1/auth/login/two-step").with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"challengeToken\":\"" + challenge + "\",\"code\":\"" + code + "\"}"));
	}

	private static String accessToken(MvcResult result) {
		return result.getResponse().getHeaders("Set-Cookie").stream()
				.filter(header -> header.startsWith("vetos_access="))
				.map(header -> header.substring("vetos_access=".length(), header.indexOf(';')))
				.findFirst()
				.orElseThrow();
	}

	private JsonNode json(MvcResult result) throws Exception {
		return objectMapper.readTree(result.getResponse().getContentAsString());
	}

	private static Cookie access(String token) {
		return new Cookie("vetos_access", token);
	}

	private static org.springframework.test.web.servlet.request.RequestPostProcessor csrf() {
		return SecurityMockMvcRequestPostProcessors.csrf();
	}
}
