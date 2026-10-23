package com.vetos.clinical;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.ApiIntegrationTest;
import com.vetos.clinical.application.WhatsAppBookingHandler;
import com.vetos.integration.application.WebhookService;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
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
class OnlineBookingTest extends ApiIntegrationTest {

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

	@Autowired
	private WebhookService webhookService;

	private final ObjectMapper objectMapper = new ObjectMapper();

	private UUID clinicId;
	private String ownerEmail;
	private String slug;
	private String knownPhone;
	private final LocalDate tomorrow = LocalDate.now(ZoneId.of("Asia/Kolkata")).plusDays(1);

	@BeforeEach
	void seed() throws Exception {
		clinicId = UuidV7.generate();
		UUID branchId = UuidV7.generate();
		UUID clientId = UuidV7.generate();
		ownerEmail = "owner-" + clinicId + "@clinic.test";
		slug = "paws-" + clinicId.toString().substring(24);
		knownPhone = "8" + ThreadLocalRandom.current().nextLong(100_000_000L, 999_999_999L);
		String hash = passwordEncoder.encode(PASSWORD);
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name, timezone) values (?, ?, 'Asia/Kolkata')", clinicId, "Paws Clinic");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, "Main");
			for (String[] user : new String[][] { { ownerEmail, "OWNER" }, { "doc-" + clinicId + "@clinic.test", "DOCTOR" } }) {
				UUID userId = UuidV7.generate();
				jdbcTemplate.update("""
						insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
						values (?, ?, ?, ?, ?, ?)
						""", userId, clinicId, branchId, user[0], hash, user[1]);
				jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, ?, ?)", userId, user[1], clinicId);
			}
			jdbcTemplate.update("insert into clients (id, clinic_id, display_name, phone, status) values (?, ?, ?, ?, 'ACTIVE')",
					clientId, clinicId, "Gowri", knownPhone);
			jdbcTemplate.update("insert into patients (id, clinic_id, client_id, name, species_code, size_category) values (?, ?, ?, 'Cooby', 'FELINE', 'SMALL')",
					UuidV7.generate(), clinicId, clientId);
		});

		String owner = login(ownerEmail);
		mockMvc.perform(put("/api/v1/clinic/online-booking")
						.cookie(new Cookie("vetos_access", owner))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"enabled":true,"slug":"%s","openTime":"10:00","closeTime":"12:00","slotMinutes":30,"days":[1,2,3,4,5,6,7]}
								""".formatted(slug)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.enabled").value(true));
	}

	@Test
	void clientBooksFromThePublicPageAndTheSlotIsThenTaken() throws Exception {
		mockMvc.perform(get("/api/v1/public/booking/" + slug))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Paws Clinic"));
		JsonNode slots = objectMapper.readTree(mockMvc.perform(get("/api/v1/public/booking/" + slug + "/slots").param("date", tomorrow.toString()))
				.andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
		assertThat(slots).hasSize(4);
		String first = slots.get(0).asText();

		String body = """
				{"ownerName":"Ravi","phone":"+91 98765 43210","petName":"Bruno","speciesCode":"CANINE","startsAt":"%s","reason":"Vaccination","whatsappConsent":true}
				""".formatted(first);
		mockMvc.perform(post("/api/v1/public/booking/" + slug).with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.petName").value("Bruno"));

		// The clinic has one doctor, so the same time cannot be booked twice.
		mockMvc.perform(post("/api/v1/public/booking/" + slug).with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON).content(body.replace("Bruno", "Max")))
				.andExpect(status().isConflict());
		mockMvc.perform(get("/api/v1/public/booking/" + slug + "/slots").param("date", tomorrow.toString()))
				.andExpect(jsonPath("$.length()").value(3));

		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			assertThat(jdbcTemplate.queryForObject("select source from appointments where clinic_id = ?", String.class, clinicId)).isEqualTo("WEBSITE");
			assertThat(jdbcTemplate.queryForObject("select phone from clients where clinic_id = ? and display_name = 'Ravi'", String.class, clinicId))
					.isEqualTo("9876543210");
		});
	}

	@Test
	void unknownOrDisabledLinksAreNotFound() throws Exception {
		mockMvc.perform(get("/api/v1/public/booking/no-such-clinic")).andExpect(status().isNotFound());
	}

	@Test
	void knownClientBooksByWhatsAppReplyingWithASlotNumber() {
		webhookService.ingestWhatsApp(inbound("Book appointment"));
		webhookService.ingestWhatsApp(inbound("1"));

		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			assertThat(jdbcTemplate.queryForList("select handled_action from whatsapp_inbound_messages where clinic_id = ? order by received_at, id",
					String.class, clinicId))
					.containsExactly(WhatsAppBookingHandler.ACTION_OFFERED, WhatsAppBookingHandler.ACTION_BOOKED);
			assertThat(jdbcTemplate.queryForObject("select source from appointments where clinic_id = ?", String.class, clinicId)).isEqualTo("WHATSAPP");
			String reply = jdbcTemplate.queryForObject("""
					select payload::text from outbox_events where clinic_id = ? and event_type = 'WHATSAPP_MESSAGE' order by created_at desc limit 1
					""", String.class, clinicId);
			assertThat(reply).contains("Booked!").contains("Cooby");
		});
	}

	private String inbound(String text) {
		return """
				{"entry":[{"id":"waba","changes":[{"value":{"messages":[{"from":"91%s","id":"wamid.%s","timestamp":"%d","type":"text","text":{"body":"%s"}}]}}]}]}
				""".formatted(knownPhone, UUID.randomUUID(), Instant.now().getEpochSecond(), text);
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
