package com.vetos.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.vetos.ApiIntegrationTest;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Calls every parameterless GET endpoint as each clinic role and fails on any 5xx. Catches server-side crashes such as
 * missing table grants or bad SQL that unit tests never reach, and checks that forbidden calls are 403, not 500.
 */
@AutoConfigureMockMvc
class ReadEndpointsSmokeTest extends ApiIntegrationTest {

	private static final String PASSWORD = "correct-horse";
	private static final List<String> ROLES = List.of("OWNER", "DOCTOR", "RECEPTIONIST", "STAFF");

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

	@Autowired
	@Qualifier("requestMappingHandlerMapping")
	private RequestMappingHandlerMapping handlerMapping;

	private final Map<String, String> emailByRole = new LinkedHashMap<>();

	@BeforeEach
	void seed() {
		UUID clinicId = UuidV7.generate();
		UUID branchId = UuidV7.generate();
		String hash = passwordEncoder.encode(PASSWORD);
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name) values (?, ?)", clinicId, "Smoke Clinic");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, "Main");
			for (String role : ROLES) {
				UUID userId = UuidV7.generate();
				String email = role.toLowerCase() + "-" + clinicId + "@clinic.test";
				emailByRole.put(role, email);
				jdbcTemplate.update("""
						insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
						values (?, ?, ?, ?, ?, ?)
						""", userId, clinicId, branchId, email, hash, role);
				jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, ?, ?)", userId, role, clinicId);
			}
			for (int i = 0; i < 2; i++) {
				jdbcTemplate.update("""
						insert into clients (id, clinic_id, display_name, phone, status, consent_whatsapp)
						values (?, ?, ?, ?, 'ACTIVE', true)
						""", UuidV7.generate(), clinicId, "Client " + i, "90000000" + i + "0");
			}
		});
	}

	@Test
	void everyParameterlessGetEndpointRespondsWithoutServerErrorForEveryRole() throws Exception {
		List<String> paths = handlerMapping.getHandlerMethods().keySet().stream()
				.filter(info -> info.getMethodsCondition().getMethods().contains(RequestMethod.GET))
				.flatMap(info -> info.getPathPatternsCondition().getPatternValues().stream())
				// /auth/csrf needs a CSRF token, which the test profile turns off.
				.filter(path -> path.startsWith("/api/") && !path.contains("{") && !path.equals("/api/v1/auth/csrf"))
				.distinct()
				.sorted()
				.toList();
		assertThat(paths).as("endpoints discovered").hasSizeGreaterThan(20);

		List<String> failures = new ArrayList<>();
		for (String role : ROLES) {
			String access = login(emailByRole.get(role));
			for (String path : paths) {
				try {
					MvcResult result = mockMvc.perform(get(path).cookie(new Cookie("vetos_access", access))).andReturn();
					int code = result.getResponse().getStatus();
					if (code >= 500) {
						failures.add(role + " " + path + " -> " + code);
					}
				}
				catch (Exception exception) {
					failures.add(role + " " + path + " -> threw " + exception.getClass().getSimpleName() + ": " + exception.getMessage());
				}
			}
		}
		assertThat(failures).as("GET endpoints that crashed").isEmpty();
	}

	@Test
	void cohortBroadcastsQueueWithoutServerError() throws Exception {
		String access = login(emailByRole.get("OWNER"));
		for (String cohort : List.of("ALL_CLIENTS", "FOLLOWUPS_7D", "VAX_7D", "DEWORM_7D", "APPOINTMENTS_24H", "LAPSED_60D")) {
			mockMvc.perform(post("/api/v1/reminders/broadcast")
							.cookie(new Cookie("vetos_access", access))
							.with(SecurityMockMvcRequestPostProcessors.csrf())
							.contentType(MediaType.APPLICATION_JSON)
							.content("{\"cohort\":\"" + cohort + "\",\"channel\":\"WHATSAPP\",\"customMessage\":\"Hello {owner_name}\"}"))
					.andExpect(status().is2xxSuccessful());
		}
	}

	@Test
	void badRequestsAreClientErrorsNotServerErrors() throws Exception {
		String access = login(emailByRole.get("OWNER"));
		mockMvc.perform(get("/api/v1/queue").cookie(new Cookie("vetos_access", access)))
				.andExpect(status().isBadRequest());
		mockMvc.perform(get("/api/v1/patients/not-a-uuid").cookie(new Cookie("vetos_access", access)))
				.andExpect(status().is4xxClientError());
		mockMvc.perform(post("/api/v1/clients")
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{not json"))
				.andExpect(status().isBadRequest());
	}

	private String login(String email) throws Exception {
		MvcResult login = mockMvc.perform(post("/api/v1/auth/login")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}"))
				.andExpect(status().isOk())
				.andReturn();
		return login.getResponse().getHeaders("Set-Cookie").stream()
				.filter(header -> header.startsWith("vetos_access="))
				.map(header -> header.substring("vetos_access=".length(), header.indexOf(';')))
				.findFirst()
				.orElseThrow();
	}

}
