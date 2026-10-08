package com.vetos.clinical;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
class VerticalSliceFlowTest extends ApiIntegrationTest {

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
	private UUID doctorId;
	private String ownerEmail;

	@BeforeEach
	void seed() {
		clinicId = UuidV7.generate();
		branchId = UuidV7.generate();
		doctorId = UuidV7.generate();
		UUID ownerId = UuidV7.generate();
		ownerEmail = "owner-" + clinicId + "@clinic.test";
		String hash = passwordEncoder.encode(PASSWORD);
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name) values (?, ?)", clinicId, "Slice Clinic");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, "Main");
			jdbcTemplate.update("""
					insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
					values (?, ?, ?, ?, ?, ?)
					""", ownerId, clinicId, branchId, ownerEmail, hash, "Owner");
			jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, 'OWNER', ?)", ownerId, clinicId);
			jdbcTemplate.update("""
					insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
					values (?, ?, ?, ?, ?, ?)
					""", doctorId, clinicId, branchId, "doc-" + clinicId + "@clinic.test", hash, "Doctor");
			jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, 'DOCTOR', ?)", doctorId, clinicId);
		});
	}

	@Test
	void fullClinicalAndBillingFlow() throws Exception {
		String access = login(ownerEmail);
		Instant start = Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MINUTES);
		Instant end = start.plus(30, ChronoUnit.MINUTES);

		MvcResult client = mockMvc.perform(post("/api/v1/clients")
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"displayName":"Ravi Kumar","phone":"9999999999","consentWhatsapp":true,"consentEmail":false}
								"""))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").exists())
				.andReturn();
		String clientId = readJson(client, "id");

		MvcResult patient = mockMvc.perform(post("/api/v1/patients")
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"clientId":"%s","name":"Bruno","speciesCode":"CANINE","sizeCategory":"MEDIUM"}
								""".formatted(clientId)))
				.andExpect(status().isCreated())
				.andReturn();
		String patientId = readJson(patient, "id");

		MvcResult appointment = mockMvc.perform(post("/api/v1/appointments")
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"branchId":"%s","patientId":"%s","doctorUserId":"%s","startsAt":"%s","endsAt":"%s"}
								""".formatted(branchId, patientId, doctorId, start, end)))
				.andExpect(status().isCreated())
				.andReturn();
		String appointmentId = readJson(appointment, "id");

		mockMvc.perform(post("/api/v1/appointments")
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"branchId":"%s","patientId":"%s","doctorUserId":"%s","startsAt":"%s","endsAt":"%s"}
								""".formatted(branchId, patientId, doctorId, start.plus(5, ChronoUnit.MINUTES), end.plus(5, ChronoUnit.MINUTES))))
				.andExpect(status().isConflict());

		mockMvc.perform(post("/api/v1/queue")
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"appointmentId\":\"" + appointmentId + "\"}"))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.tokenNumber").value(1));

		MvcResult consultation = mockMvc.perform(post("/api/v1/consultations")
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"appointmentId":"%s","doctorRemarks":"Mild fever","doctorNotes":"Rest advised","differentials":[{"label":"Kennel cough","rank":1}]}
								""".formatted(appointmentId)))
				.andExpect(status().isCreated())
				.andReturn();
		String consultationId = readJson(consultation, "id");

		MvcResult prescription = mockMvc.perform(post("/api/v1/prescriptions")
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"consultationId":"%s","items":[{"medicineName":"Amoxicillin","quantity":1,"dosage":"250mg","frequency":"BID","duration":"5 days"}]}
								""".formatted(consultationId)))
				.andExpect(status().isCreated())
				.andReturn();
		String prescriptionId = readJson(prescription, "id");
		String itemId = com.jayway.jsonpath.JsonPath.read(prescription.getResponse().getContentAsString(), "$.items[0].id");

		MvcResult invoice = mockMvc.perform(post("/api/v1/invoices")
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"prescriptionId":"%s","linePrices":[{"prescriptionItemId":"%s","unitPrice":500}]}
								""".formatted(prescriptionId, itemId)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.total").exists())
				.andReturn();
		String invoiceId = readJson(invoice, "id");
		String invoiceTotal = readJson(invoice, "total");

		mockMvc.perform(post("/api/v1/payments")
						.header("Idempotency-Key", "pay-" + invoiceId)
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"invoiceId":"%s","method":"UPI","amount":%s}
								""".formatted(invoiceId, invoiceTotal)))
				.andExpect(status().isCreated());

		mockMvc.perform(post("/api/v1/payments")
						.header("Idempotency-Key", "pay-" + invoiceId)
						.cookie(new Cookie("vetos_access", access))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"invoiceId":"%s","method":"UPI","amount":%s}
								""".formatted(invoiceId, invoiceTotal)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.id").exists());
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

	private static String readJson(MvcResult result, String field) throws Exception {
		return com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$." + field).toString();
	}

}
