package com.vetos.identity.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.identity.infrastructure.TokenHasher;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.config.VetosProperties;
import com.vetos.platform.ids.UuidV7;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * Two-step login with an authenticator app (Google Authenticator, Microsoft Authenticator, ...).
 * Every method runs inside a tenant-scoped transaction opened by the caller.
 */
@Service
public class TwoStepService {

	/** Roles that must use two-step login when the clinic turns on "require two-step login". */
	public static final List<String> REQUIRED_ROLES = List.of("OWNER", "DOCTOR");

	private static final int RECOVERY_CODE_COUNT = 8;
	private static final int LOCK_AFTER_FAILURES = 5;
	private static final String ISSUER = "VetOS";
	private static final char[] RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789".toCharArray();
	private static final SecureRandom RANDOM = new SecureRandom();

	private final JdbcTemplate jdbcTemplate;
	private final PasswordEncoder passwordEncoder;
	private final AuditRecorder auditRecorder;
	private final String serverSecret;

	public TwoStepService(JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder, AuditRecorder auditRecorder, VetosProperties properties) {
		this.jdbcTemplate = jdbcTemplate;
		this.passwordEncoder = passwordEncoder;
		this.auditRecorder = auditRecorder;
		this.serverSecret = properties.jwt().secret();
	}

	public Status status(UUID userId, List<String> roles) {
		Map<String, Object> row = jdbcTemplate.queryForMap("""
				select u.totp_enabled_at, c.require_two_step,
				       (select count(*) from user_recovery_codes r where r.user_id = u.id and r.used_at is null) as codes_left
				from users u join clinics c on c.id = u.clinic_id
				where u.id = ?
				""", userId);
		boolean enabled = row.get("totp_enabled_at") != null;
		boolean required = Boolean.TRUE.equals(row.get("require_two_step")) && hasRequiredRole(roles);
		return new Status(enabled, required, ((Number) row.get("codes_left")).intValue());
	}

	/** The clinic requires two-step login for this user's role and they have not set it up. */
	public boolean setupRequired(UUID userId, List<String> roles) {
		if (!hasRequiredRole(roles)) {
			return false;
		}
		Boolean required = jdbcTemplate.queryForObject("""
				select c.require_two_step and u.totp_enabled_at is null
				from users u join clinics c on c.id = u.clinic_id where u.id = ?
				""", Boolean.class, userId);
		return Boolean.TRUE.equals(required);
	}

	/** Starts setup: a new secret the user adds to their app by scanning the QR code. */
	public Setup beginSetup(UUID userId) {
		String email = jdbcTemplate.queryForObject("select email from users where id = ?", String.class, userId);
		String clinicName = jdbcTemplate.queryForObject("select c.name from users u join clinics c on c.id = u.clinic_id where u.id = ?",
				String.class, userId);
		String secret = Totp.newSecret();
		jdbcTemplate.update("update users set totp_pending_secret = ?, updated_at = now() where id = ?", Totp.encrypt(secret, serverSecret), userId);
		String issuer = clinicName == null || clinicName.isBlank() ? ISSUER : ISSUER + " " + clinicName;
		String uri = Totp.otpauthUri(issuer, email, secret);
		return new Setup(secret, uri, Totp.qrSvg(uri));
	}

	/** Finishes setup once the user types a code from the app; returns one-time recovery codes to keep safe. */
	public List<String> confirmSetup(UUID clinicId, UUID userId, String code, String requestId) {
		String pending = jdbcTemplate.queryForObject("select totp_pending_secret from users where id = ?", String.class, userId);
		if (pending == null) {
			throw ApiException.badRequest("Start two-step setup first.");
		}
		long step = Totp.verify(Totp.decrypt(pending, serverSecret), code, Instant.now().getEpochSecond(), null);
		if (step < 0) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TWO_STEP_INVALID", "That code is not right. Check the time on your phone and try the latest code.");
		}
		jdbcTemplate.update("""
				update users set totp_secret = totp_pending_secret, totp_pending_secret = null, totp_enabled_at = now(),
				       totp_last_step = ?, updated_at = now()
				where id = ?
				""", step, userId);
		auditRecorder.record(clinicId, userId, "TWO_STEP_ENABLED", "user", userId, requestId);
		return newRecoveryCodes(clinicId, userId);
	}

	public List<String> regenerateRecoveryCodes(UUID clinicId, UUID userId, String code, String requestId) {
		if (!verifyAuthenticatorCode(userId, code)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TWO_STEP_INVALID", "That code is not right.");
		}
		auditRecorder.record(clinicId, userId, "TWO_STEP_RECOVERY_CODES_RENEWED", "user", userId, requestId);
		return newRecoveryCodes(clinicId, userId);
	}

	public void disable(UUID clinicId, UUID userId, List<String> roles, String password, String code, String requestId) {
		if (status(userId, roles).required()) {
			throw ApiException.badRequest("Your clinic requires two-step login for your role, so it cannot be turned off.");
		}
		String hash = jdbcTemplate.queryForObject("select password_hash from users where id = ?", String.class, userId);
		if (password == null || !passwordEncoder.matches(password, hash) || !verifyAuthenticatorCode(userId, code)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "TWO_STEP_INVALID", "Password or code is not right.");
		}
		clear(userId);
		auditRecorder.record(clinicId, userId, "TWO_STEP_DISABLED", "user", userId, requestId);
	}

	/** Clinic owner resets a staff member's two-step login (lost phone); they set it up again at next sign-in. */
	public void adminReset(UUID clinicId, UUID actorId, UUID targetUserId, String requestId) {
		Integer exists = jdbcTemplate.queryForObject("select count(*) from users where id = ? and clinic_id = ?", Integer.class, targetUserId, clinicId);
		if (exists == null || exists == 0) {
			throw ApiException.notFound();
		}
		clear(targetUserId);
		auditRecorder.record(clinicId, actorId, "TWO_STEP_RESET", "user", targetUserId, requestId);
	}

	/**
	 * Second login step. Accepts an authenticator code (never the same one twice) or an unused recovery code.
	 * Wrong codes count towards the same lockout as wrong passwords.
	 */
	public boolean verifyLoginCode(UUID clinicId, UUID userId, String code) {
		Map<String, Object> user = jdbcTemplate.queryForMap(
				"select status, locked_until, failed_login_count from users where id = ? and deleted_at is null", userId);
		Timestamp lockedUntil = (Timestamp) user.get("locked_until");
		if (!"ACTIVE".equals(user.get("status")) || (lockedUntil != null && lockedUntil.toInstant().isAfter(Instant.now()))) {
			return false;
		}
		boolean ok = verifyAuthenticatorCode(userId, code) || useRecoveryCode(userId, code);
		if (!ok) {
			int next = ((Number) user.get("failed_login_count")).intValue() + 1;
			jdbcTemplate.update("""
					update users set failed_login_count = ?, locked_until = case when ? >= ? then now() + interval '15 minutes' else locked_until end,
					       updated_at = now()
					where id = ?
					""", next, next, LOCK_AFTER_FAILURES, userId);
			auditRecorder.record(clinicId, userId, "TWO_STEP_FAILED", "user", userId, null);
		}
		return ok;
	}

	private boolean verifyAuthenticatorCode(UUID userId, String code) {
		Map<String, Object> row = jdbcTemplate.queryForMap("select totp_secret, totp_last_step from users where id = ?", userId);
		String stored = (String) row.get("totp_secret");
		if (stored == null) {
			return false;
		}
		Long lastStep = row.get("totp_last_step") == null ? null : ((Number) row.get("totp_last_step")).longValue();
		long step = Totp.verify(Totp.decrypt(stored, serverSecret), code, Instant.now().getEpochSecond(), lastStep);
		if (step < 0) {
			return false;
		}
		jdbcTemplate.update("update users set totp_last_step = ? where id = ?", step, userId);
		return true;
	}

	private boolean useRecoveryCode(UUID userId, String code) {
		String normalized = normalizeRecoveryCode(code);
		if (normalized.length() != 10) {
			return false;
		}
		return jdbcTemplate.update("""
				update user_recovery_codes set used_at = now()
				where user_id = ? and code_hash = ? and used_at is null
				""", userId, TokenHasher.sha256(normalized)) == 1;
	}

	private List<String> newRecoveryCodes(UUID clinicId, UUID userId) {
		jdbcTemplate.update("delete from user_recovery_codes where user_id = ?", userId);
		List<String> codes = new ArrayList<>();
		for (int i = 0; i < RECOVERY_CODE_COUNT; i++) {
			StringBuilder raw = new StringBuilder();
			for (int c = 0; c < 10; c++) {
				raw.append(RECOVERY_ALPHABET[RANDOM.nextInt(RECOVERY_ALPHABET.length)]);
			}
			String value = raw.toString();
			jdbcTemplate.update("insert into user_recovery_codes (id, clinic_id, user_id, code_hash) values (?, ?, ?, ?)",
					UuidV7.generate(), clinicId, userId, TokenHasher.sha256(value));
			codes.add(value.substring(0, 5) + "-" + value.substring(5));
		}
		return codes;
	}

	private void clear(UUID userId) {
		jdbcTemplate.update("""
				update users set totp_secret = null, totp_pending_secret = null, totp_enabled_at = null, totp_last_step = null,
				       updated_at = now()
				where id = ?
				""", userId);
		jdbcTemplate.update("delete from user_recovery_codes where user_id = ?", userId);
	}

	static String normalizeRecoveryCode(String code) {
		return code == null ? "" : code.replaceAll("[\\s-]", "").toLowerCase(Locale.ROOT);
	}

	private static boolean hasRequiredRole(List<String> roles) {
		return roles != null && roles.stream().anyMatch(REQUIRED_ROLES::contains);
	}

	public record Status(boolean enabled, boolean required, int recoveryCodesLeft) {
	}

	public record Setup(String secret, String otpauthUri, String qrSvg) {
	}
}
