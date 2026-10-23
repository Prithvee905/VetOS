package com.vetos.platform;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.ApiIntegrationTest;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import jakarta.servlet.http.Cookie;
import java.time.LocalDate;
import java.time.ZoneId;
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
class VaccineScheduleTest extends ApiIntegrationTest {

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
	private UUID clientId;
	private String ownerEmail;
	private String doctorEmail;
	private final LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));

	@BeforeEach
	void seed() {
		clinicId = UuidV7.generate();
		UUID branchId = UuidV7.generate();
		clientId = UuidV7.generate();
		ownerEmail = "owner-" + clinicId + "@clinic.test";
		doctorEmail = "doctor-" + clinicId + "@clinic.test";
		String hash = passwordEncoder.encode(PASSWORD);
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name, timezone) values (?, ?, 'Asia/Kolkata')", clinicId, "Vaccine Clinic");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, "Main");
			for (String[] user : new String[][] { { ownerEmail, "OWNER" }, { doctorEmail, "DOCTOR" } }) {
				UUID userId = UuidV7.generate();
				jdbcTemplate.update("""
						insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
						values (?, ?, ?, ?, ?, ?)
						""", userId, clinicId, branchId, user[0], hash, user[1]);
				jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, ?, ?)", userId, user[1], clinicId);
			}
			jdbcTemplate.update("insert into clients (id, clinic_id, display_name, phone, status) values (?, ?, ?, ?, 'ACTIVE')",
					clientId, clinicId, "Gowri", "6281356498");
		});
	}

	@Test
	void puppyGetsPrimarySeriesAndRecordedDoseAdvancesIt() throws Exception {
		String owner = login(ownerEmail);
		postJson(owner, "/api/v1/vaccine-protocols", """
				{"speciesCode":"CANINE","vaccineName":"DHPPi","aliases":"dhpp, 9-in-1","firstDoseAgeWeeks":6,
				 "primaryDoses":3,"primaryIntervalWeeks":3,"boosterIntervalMonths":12}
				""", 201);

		LocalDate dob = today.minusWeeks(7);
		String doctor = login(doctorEmail);
		JsonNode puppy = postJson(doctor, "/api/v1/patients", """
				{"clientId":"%s","name":"Bruno","speciesCode":"CANINE","sizeCategory":"SMALL","dateOfBirth":"%s"}
				""".formatted(clientId, dob), 201);
		String puppyId = puppy.get("id").asText();

		mockMvc.perform(get("/api/v1/patients/" + puppyId + "/vaccine-schedule").cookie(new Cookie("vetos_access", doctor)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(3))
				.andExpect(jsonPath("$[0].doseLabel").value("Dose 1 of 3"))
				.andExpect(jsonPath("$[0].dueOn").value(dob.plusWeeks(6).toString()))
				.andExpect(jsonPath("$[2].dueOn").value(dob.plusWeeks(12).toString()));

		postJson(doctor, "/api/v1/vaccinations", """
				{"patientId":"%s","vaccineName":"Nobivac DHPPi + L","administeredOn":"%s"}
				""".formatted(puppyId, today), 201);

		mockMvc.perform(get("/api/v1/patients/" + puppyId + "/vaccine-schedule").cookie(new Cookie("vetos_access", doctor)))
				.andExpect(jsonPath("$[0].status").value("DONE"))
				.andExpect(jsonPath("$[1].status").value("DUE"));
		mockMvc.perform(get("/api/v1/vaccinations").param("patientId", puppyId).cookie(new Cookie("vetos_access", doctor)))
				.andExpect(jsonPath("$[0].nextDueOn").value(dob.plusWeeks(9).toString()));
	}

	@Test
	void newProtocolPicksUpExistingCardsAndLastDoseStartsBoosters() throws Exception {
		UUID adultId = UuidV7.generate();
		UUID doseId = UuidV7.generate();
		LocalDate given = today.minusMonths(11);
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into patients (id, clinic_id, client_id, name, species_code, size_category) values (?, ?, ?, ?, 'CANINE', 'LARGE')",
					adultId, clinicId, clientId, "Max");
			jdbcTemplate.update("""
					insert into vaccination_doses (id, clinic_id, patient_id, vaccine_name, administered_on, next_due_on)
					values (?, ?, ?, 'Anti-Rabies (ARV)', ?, ?)
					""", doseId, clinicId, adultId, java.sql.Date.valueOf(given), java.sql.Date.valueOf(given.plusYears(1)));
		});

		String owner = login(ownerEmail);
		postJson(owner, "/api/v1/vaccine-protocols", """
				{"speciesCode":"CANINE","vaccineName":"Rabies","aliases":"arv","boosterIntervalMonths":12}
				""", 201);

		String doctor = login(doctorEmail);
		mockMvc.perform(get("/api/v1/patients/" + adultId + "/vaccine-schedule").cookie(new Cookie("vetos_access", doctor)))
				.andExpect(jsonPath("$.length()").value(1))
				.andExpect(jsonPath("$[0].doseLabel").value("Booster"))
				.andExpect(jsonPath("$[0].dueOn").value(given.plusYears(1).toString()));

		// The booster is given: it is ticked off and the next one is planned a year on.
		postJson(doctor, "/api/v1/vaccinations", """
				{"patientId":"%s","vaccineName":"Rabies","administeredOn":"%s"}
				""".formatted(adultId, today), 201);
		Integer due = transactionTemplate.execute(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			return jdbcTemplate.queryForObject("""
					select count(*) from vaccination_schedule where patient_id = ? and status = 'DUE' and due_on = ?
					""", Integer.class, adultId, java.sql.Date.valueOf(today.plusMonths(12)));
		});
		assertThat(due).isEqualTo(1);
	}

	@Test
	void vaccinesRecordedInOneVisitSendOneCardOnWhatsAppLater() throws Exception {
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("update clinics set send_vaccination_card = true where id = ?", clinicId);
		});
		String doctor = login(doctorEmail);
		String petId = postJson(doctor, "/api/v1/patients", """
				{"clientId":"%s","name":"Bruno","speciesCode":"CANINE","sizeCategory":"SMALL"}
				""".formatted(clientId), 201).get("id").asText();
		for (String vaccine : new String[] { "Rabies", "DHPPi" }) {
			postJson(doctor, "/api/v1/vaccinations", """
					{"patientId":"%s","vaccineName":"%s","administeredOn":"%s"}
					""".formatted(petId, vaccine, today), 201);
		}
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			var rows = jdbcTemplate.queryForList("""
					select payload->>'template' as template, next_attempt_at > now() + interval '10 minutes' as delayed
					from outbox_events where clinic_id = ? and payload->>'vaccinationCardPatientId' = ?
					""", clinicId, petId);
			assertThat(rows).hasSize(1);
			assertThat(rows.getFirst().get("template")).isEqualTo("VACCINATION_CARD");
			assertThat(rows.getFirst().get("delayed")).isEqualTo(true);
		});
		mockMvc.perform(get("/api/v1/patients/" + petId + "/vaccination-card.pdf").cookie(new Cookie("vetos_access", doctor)))
				.andExpect(status().isOk())
				.andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().contentType("application/pdf"));
	}

	@Test
	void receptionCannotChangeProtocolsAndProtocolNeedsATiming() throws Exception {
		String doctor = login(doctorEmail);
		postJson(doctor, "/api/v1/vaccine-protocols", """
				{"speciesCode":"CANINE","vaccineName":"Rabies","boosterIntervalMonths":12}
				""", 403);
		String owner = login(ownerEmail);
		postJson(owner, "/api/v1/vaccine-protocols", """
				{"speciesCode":"CANINE","vaccineName":"Rabies"}
				""", 400);
	}

	private JsonNode postJson(String token, String path, String body, int expectedStatus) throws Exception {
		MvcResult result = mockMvc.perform(post(path)
						.cookie(new Cookie("vetos_access", token))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content(body))
				.andExpect(status().is(expectedStatus))
				.andReturn();
		String text = result.getResponse().getContentAsString();
		return text.isBlank() ? null : objectMapper.readTree(text);
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
