package com.vetos.clinical;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.ApiIntegrationTest;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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
class QueueTokenTest extends ApiIntegrationTest {

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
	private UUID branchId;
	private UUID doctorId;
	private UUID patientId;
	private String email;

	@BeforeEach
	void seed() {
		clinicId = UuidV7.generate();
		branchId = UuidV7.generate();
		doctorId = UuidV7.generate();
		patientId = UuidV7.generate();
		UUID clientId = UuidV7.generate();
		email = "doctor-" + clinicId + "@clinic.test";
		String hash = passwordEncoder.encode(PASSWORD);
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name, timezone) values (?, ?, 'Asia/Kolkata')", clinicId, "Queue Clinic");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, "Main");
			jdbcTemplate.update("""
					insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
					values (?, ?, ?, ?, ?, 'Doctor')
					""", doctorId, clinicId, branchId, email, hash);
			jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, 'DOCTOR', ?)", doctorId, clinicId);
			jdbcTemplate.update("insert into clients (id, clinic_id, display_name, phone, status) values (?, ?, 'Owner', '6281356498', 'ACTIVE')",
					clientId, clinicId);
			jdbcTemplate.update("insert into patients (id, clinic_id, client_id, name, species_code, size_category) values (?, ?, ?, 'Bruno', 'CANINE', 'SMALL')",
					patientId, clinicId, clientId);
		});
	}

	@Test
	void tokensCountUpWithinADayAndStartAgainAtOneTheNextDay() throws Exception {
		String access = login();
		Instant base = Instant.now().plus(2, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MINUTES);

		org.assertj.core.api.Assertions.assertThat(checkIn(access, base, 1)).isEqualTo(1);
		org.assertj.core.api.Assertions.assertThat(checkIn(access, base, 2)).isEqualTo(2);

		// Pretend those two visits happened yesterday.
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("update queue_entries set checked_in_at = checked_in_at - interval '1 day' where clinic_id = ?", clinicId);
		});

		org.assertj.core.api.Assertions.assertThat(checkIn(access, base, 3)).isEqualTo(1);
		org.assertj.core.api.Assertions.assertThat(checkIn(access, base, 4)).isEqualTo(2);
	}

	/** Books a fresh appointment {@code slot} hours apart from the others and checks it in; returns the token. */
	private int checkIn(String access, Instant base, int slot) throws Exception {
		Instant start = base.plus(slot * 2L, ChronoUnit.HOURS);
		Instant end = start.plus(30, ChronoUnit.MINUTES);
		MvcResult appointment = mockMvc.perform(post("/api/v1/appointments")
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"branchId":"%s","patientId":"%s","doctorUserId":"%s","startsAt":"%s","endsAt":"%s"}
								""".formatted(branchId, patientId, doctorId, start, end)))
				.andExpect(status().isCreated())
				.andReturn();
		String appointmentId = objectMapper.readTree(appointment.getResponse().getContentAsString()).get("id").asText();
		MvcResult queued = mockMvc.perform(post("/api/v1/queue")
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"appointmentId\":\"" + appointmentId + "\"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.tokenNumber").isNumber())
				.andReturn();
		return objectMapper.readTree(queued.getResponse().getContentAsString()).get("tokenNumber").asInt();
	}

	private String login() throws Exception {
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
