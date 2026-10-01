package com.vetos.clinic;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
class ClinicUserAdminTest extends ApiIntegrationTest {

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
	private String ownerEmail;
	private String doctorEmail;

	@BeforeEach
	void seedClinic() {
		clinicId = UuidV7.generate();
		branchId = UuidV7.generate();
		ownerEmail = "owner-" + clinicId + "@clinic.test";
		doctorEmail = "doctor-" + clinicId + "@clinic.test";
		UUID ownerId = UuidV7.generate();
		UUID doctorId = UuidV7.generate();
		String hash = passwordEncoder.encode(PASSWORD);
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name) values (?, ?)", clinicId, "Admin Clinic");
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, "Front");
			jdbcTemplate.update("""
					insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
					values (?, ?, ?, ?, ?, ?)
					""", ownerId, clinicId, branchId, ownerEmail, hash, "Clinic Owner");
			jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, 'OWNER', ?)", ownerId, clinicId);
			jdbcTemplate.update("""
					insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
					values (?, ?, ?, ?, ?, ?)
					""", doctorId, clinicId, branchId, doctorEmail, hash, "Clinic Doctor");
			jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, 'DOCTOR', ?)", doctorId, clinicId);
		});
	}

	@Test
	void ownerManagesClinicAndUsers() throws Exception {
		String ownerAccess = login(ownerEmail);

		mockMvc.perform(get("/api/v1/clinic").cookie(accessCookie(ownerAccess)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Admin Clinic"))
				.andExpect(jsonPath("$.version").value(0));

		mockMvc.perform(patch("/api/v1/clinic")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.cookie(accessCookie(ownerAccess))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"version":0,"name":"Updated Clinic","phone":"9999999999"}
								"""))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Updated Clinic"))
				.andExpect(jsonPath("$.phone").value("9999999999"));

		mockMvc.perform(get("/api/v1/users").cookie(accessCookie(ownerAccess)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items.length()").value(2));

		mockMvc.perform(post("/api/v1/users")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.cookie(accessCookie(ownerAccess))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "email":"staff-%s@clinic.test",
								  "password":"correct-horse",
								  "displayName":"Front Staff",
								  "branchId":"%s",
								  "roles":["RECEPTIONIST"]
								}
								""".formatted(clinicId, branchId)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.roles[0]").value("RECEPTIONIST"));

		mockMvc.perform(post("/api/v1/users")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.cookie(accessCookie(ownerAccess))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{
								  "email":"staff-%s@clinic.test",
								  "password":"correct-horse",
								  "displayName":"Duplicate",
								  "roles":["STAFF"]
								}
								""".formatted(clinicId)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("CONFLICT"));
	}

	@Test
	void doctorCannotManageClinicOrUsers() throws Exception {
		String doctorAccess = login(doctorEmail);

		mockMvc.perform(patch("/api/v1/clinic")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.cookie(accessCookie(doctorAccess))
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"version":0,"name":"Hacked"}
								"""))
				.andExpect(status().isForbidden());

		mockMvc.perform(get("/api/v1/users").cookie(accessCookie(doctorAccess)))
				.andExpect(status().isForbidden());

		mockMvc.perform(get("/api/v1/clinic").cookie(accessCookie(doctorAccess)))
				.andExpect(status().isOk());
	}

	private String login(String email) throws Exception {
		MvcResult login = mockMvc.perform(post("/api/v1/auth/login")
						.with(SecurityMockMvcRequestPostProcessors.csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"email":"%s","password":"%s"}
								""".formatted(email, PASSWORD)))
				.andExpect(status().isOk())
				.andReturn();
		return cookie(login, "vetos_access");
	}

	private static Cookie accessCookie(String access) {
		return new Cookie("vetos_access", access);
	}

	private static String cookie(MvcResult result, String name) {
		return result.getResponse().getHeaders("Set-Cookie").stream()
				.filter(header -> header.startsWith(name + "="))
				.map(header -> header.substring(name.length() + 1, header.indexOf(';')))
				.findFirst()
				.orElseThrow();
	}

}
