package com.vetos.platform;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
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
class ClinicWorkspaceTest extends ApiIntegrationTest {

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

	private UUID clientId;
	private UUID patientId;
	private String receptionEmail;
	private String doctorEmail;

	@BeforeEach
	void seed() {
		UUID clinicId = UuidV7.generate();
		UUID branchId = UuidV7.generate();
		clientId = UuidV7.generate();
		patientId = UuidV7.generate();
		receptionEmail = "reception-" + clinicId + "@clinic.test";
		doctorEmail = "doctor-" + clinicId + "@clinic.test";
		String hash = passwordEncoder.encode(PASSWORD);
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name) values (?, ?)", clinicId, "Workspace Clinic");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, "Main");
			for (String[] user : new String[][] { { receptionEmail, "RECEPTIONIST" }, { doctorEmail, "DOCTOR" } }) {
				UUID userId = UuidV7.generate();
				jdbcTemplate.update("""
						insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
						values (?, ?, ?, ?, ?, ?)
						""", userId, clinicId, branchId, user[0], hash, user[1]);
				jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, ?, ?)", userId, user[1], clinicId);
			}
			jdbcTemplate.update("insert into clients (id, clinic_id, display_name, phone, status) values (?, ?, ?, ?, 'ACTIVE')",
					clientId, clinicId, "Gowri", "6281356498");
			jdbcTemplate.update("insert into patients (id, clinic_id, client_id, name, species_code, size_category) values (?, ?, ?, ?, 'FELINE', 'SMALL')",
					patientId, clinicId, clientId, "Cooby");
		});
	}

	@Test
	void basketSavedByDoctorIsVisibleToReceptionUntilCleared() throws Exception {
		String doctor = login(doctorEmail);
		mockMvc.perform(put("/api/v1/baskets/" + patientId)
						.cookie(new Cookie("vetos_access", doctor))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"clientId":"%s","lines":[{"description":"Consultation","quantity":1,"unitPrice":600}]}
								""".formatted(clientId)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.lines[0].unitPrice").value(600));

		String reception = login(receptionEmail);
		mockMvc.perform(get("/api/v1/baskets").cookie(new Cookie("vetos_access", reception)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].patientName").value("Cooby"))
				.andExpect(jsonPath("$[0].lineCount").value(1));
		mockMvc.perform(get("/api/v1/baskets/" + patientId).cookie(new Cookie("vetos_access", reception)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.lines[0].description").value("Consultation"));

		mockMvc.perform(delete("/api/v1/baskets/" + patientId)
						.cookie(new Cookie("vetos_access", reception))
						.with(SecurityMockMvcRequestPostProcessors.csrf()))
				.andExpect(status().isNoContent());
		mockMvc.perform(get("/api/v1/baskets/" + patientId).cookie(new Cookie("vetos_access", reception)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.lines").isEmpty());
	}

	@Test
	void healthProfileIsStoredOnTheServer() throws Exception {
		String doctor = login(doctorEmail);
		mockMvc.perform(get("/api/v1/patients/" + patientId + "/health-profile").cookie(new Cookie("vetos_access", doctor)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.profile").doesNotExist());

		mockMvc.perform(put("/api/v1/patients/" + patientId + "/health-profile")
						.cookie(new Cookie("vetos_access", doctor))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"profile":{"allergies":["Penicillin"],"weights":[{"id":"w1","date":"2026-10-22","weightKg":4.2}]}}
								"""))
				.andExpect(status().isOk());

		String reception = login(receptionEmail);
		mockMvc.perform(get("/api/v1/patients/" + patientId + "/health-profile").cookie(new Cookie("vetos_access", reception)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.profile.allergies[0]").value("Penicillin"))
				.andExpect(jsonPath("$.profile.weights[0].weightKg").value(4.2));
	}

	@Test
	void gstInclusivePriceIsSplitIntoTaxableValueAndTax() throws Exception {
		String reception = login(receptionEmail);
		mockMvc.perform(post("/api/v1/invoices")
						.cookie(new Cookie("vetos_access", reception))
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"clientId":"%s","patientId":"%s","lines":[
								{"sourceType":"PRODUCT","description":"Drontal Plus","quantity":1,"unitPrice":1500,"taxRate":0.12,"hsnSac":"3004"}]}
								""".formatted(clientId, patientId)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.subtotal").value(1339.29))
				.andExpect(jsonPath("$.taxTotal").value(160.71))
				.andExpect(jsonPath("$.total").value(1500.00))
				.andExpect(jsonPath("$.lines[0].hsnSac").value("3004"));
	}

	@Test
	void unknownPatientIsNotFound() throws Exception {
		String doctor = login(doctorEmail);
		mockMvc.perform(get("/api/v1/patients/" + UuidV7.generate() + "/health-profile").cookie(new Cookie("vetos_access", doctor)))
				.andExpect(status().isNotFound());
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
