package com.vetos.platform.api;

import com.vetos.platform.config.VetosProperties;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/platform-admin")
public class PlatformAdminController {

	private final JdbcTemplate jdbcTemplate;
	private final TransactionTemplate transactionTemplate;
	private final TenantTransactionSupport tenantTransactionSupport;
	private final PasswordEncoder passwordEncoder;
	private final VetosProperties properties;

	public PlatformAdminController(
			JdbcTemplate jdbcTemplate,
			TransactionTemplate transactionTemplate,
			TenantTransactionSupport tenantTransactionSupport,
			PasswordEncoder passwordEncoder,
			VetosProperties properties) {
		this.jdbcTemplate = jdbcTemplate;
		this.transactionTemplate = transactionTemplate;
		this.tenantTransactionSupport = tenantTransactionSupport;
		this.passwordEncoder = passwordEncoder;
		this.properties = properties;
	}

	private void verifySecret(String secret) {
		String expected = properties.platform() != null && properties.platform().adminSecret() != null
				? properties.platform().adminSecret()
				: "vetos-platform-admin-secret-change-me";
		if (secret == null || !secret.trim().equals(expected.trim())) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Invalid platform admin secret.");
		}
	}

	@PostMapping("/onboard-clinic")
	public ResponseEntity<Map<String, Object>> onboardClinic(
			@RequestHeader(value = "X-Platform-Admin-Secret", required = false) String secret,
			@Valid @RequestBody OnboardClinicRequest request) {
		verifySecret(secret);

		Long existing = jdbcTemplate.queryForObject(
				"select count(*) from app.find_login(?)",
				Long.class,
				request.email().trim());
		if (existing != null && existing > 0) {
			throw new ApiException(HttpStatus.CONFLICT, "DUPLICATE_EMAIL", "A user with email '" + request.email() + "' already exists.");
		}

		UUID clinicId = UuidV7.generate();
		UUID branchId = UuidV7.generate();
		UUID userId = UuidV7.generate();
		String passwordHash = passwordEncoder.encode(request.password());
		String branchName = request.branchName() != null && !request.branchName().isBlank() ? request.branchName().trim() : "Main";
		String displayName = request.displayName() != null && !request.displayName().isBlank() ? request.displayName().trim() : "Clinic Owner";

		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update("insert into clinics (id, name) values (?, ?)", clinicId, request.clinicName().trim());
			jdbcTemplate.update("insert into branches (id, clinic_id, name) values (?, ?, ?)", branchId, clinicId, branchName);
			jdbcTemplate.update("""
					insert into users (id, clinic_id, branch_id, email, password_hash, display_name)
					values (?, ?, ?, ?, ?, ?)
					""", userId, clinicId, branchId, request.email().trim(), passwordHash, displayName);
			jdbcTemplate.update("insert into user_roles (user_id, role_code, clinic_id) values (?, 'OWNER', ?)", userId, clinicId);
		});

		return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
				"status", "SUCCESS",
				"clinicId", clinicId.toString(),
				"branchId", branchId.toString(),
				"userId", userId.toString(),
				"clinicName", request.clinicName().trim(),
				"email", request.email().trim(),
				"displayName", displayName
		));
	}

	@PostMapping("/reset-password")
	public ResponseEntity<Map<String, Object>> resetPassword(
			@RequestHeader(value = "X-Platform-Admin-Secret", required = false) String secret,
			@Valid @RequestBody ResetPasswordRequest request) {
		verifySecret(secret);

		var loginData = jdbcTemplate.query(
				"select user_id, clinic_id from app.find_login(?)",
				(rs, rowNum) -> Map.of(
						"userId", (UUID) rs.getObject("user_id"),
						"clinicId", (UUID) rs.getObject("clinic_id")
				),
				request.email().trim());

		if (loginData.isEmpty()) {
			throw new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "No user found with email: " + request.email());
		}

		UUID userId = loginData.get(0).get("userId");
		UUID clinicId = loginData.get(0).get("clinicId");
		String newHash = passwordEncoder.encode(request.newPassword());

		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			jdbcTemplate.update(
					"update users set password_hash = ?, failed_login_count = 0, locked_until = null, updated_at = now() where id = ?",
					newHash,
					userId);
		});

		return ResponseEntity.ok(Map.of(
				"status", "SUCCESS",
				"userId", userId.toString(),
				"email", request.email().trim(),
				"message", "Password successfully reset."
		));
	}

	public record OnboardClinicRequest(
			@NotBlank @Size(max = 200) String clinicName,
			@NotBlank @Email @Size(max = 320) String email,
			@NotBlank @Size(min = 8, max = 128) String password,
			String displayName,
			String branchName
	) {}

	public record ResetPasswordRequest(
			@NotBlank @Email @Size(max = 320) String email,
			@NotBlank @Size(min = 8, max = 128) String newPassword
	) {}
}
