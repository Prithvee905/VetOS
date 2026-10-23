package com.vetos.identity.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.identity.domain.SessionUser;
import com.vetos.identity.infrastructure.AccessTokenService;
import com.vetos.identity.infrastructure.TokenHasher;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.config.VetosProperties;
import com.vetos.platform.ids.UuidV7;
import com.vetos.tenant.infrastructure.TenantTransactionSupport;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class AuthService {

	private static final int LOCK_AFTER_FAILURES = 5;

	private final JdbcTemplate jdbcTemplate;
	private final TransactionTemplate transactionTemplate;
	private final TenantTransactionSupport tenantTransactionSupport;
	private final PasswordEncoder passwordEncoder;
	private final AccessTokenService accessTokenService;
	private final AuditRecorder auditRecorder;
	private final VetosProperties properties;
	private final TwoStepService twoStepService;
	private final String dummyHash;

	public AuthService(
			JdbcTemplate jdbcTemplate,
			TransactionTemplate transactionTemplate,
			TenantTransactionSupport tenantTransactionSupport,
			PasswordEncoder passwordEncoder,
			AccessTokenService accessTokenService,
			AuditRecorder auditRecorder,
			VetosProperties properties,
			TwoStepService twoStepService) {
		this.jdbcTemplate = jdbcTemplate;
		this.transactionTemplate = transactionTemplate;
		this.tenantTransactionSupport = tenantTransactionSupport;
		this.passwordEncoder = passwordEncoder;
		this.accessTokenService = accessTokenService;
		this.auditRecorder = auditRecorder;
		this.properties = properties;
		this.twoStepService = twoStepService;
		this.dummyHash = passwordEncoder.encode("vetos-dummy-password");
	}

	/** Password check. Accounts with two-step login get a challenge to complete with {@link #completeTwoStep}. */
	public LoginResult login(String email, String password, String requestId) {
		Optional<LoginAccount> found = findLogin(email);
		if (found.isEmpty()) {
			passwordEncoder.matches(password, dummyHash);
			throw ApiException.unauthorized();
		}
		LoginAccount account = found.get();
		if (account.lockedUntil() != null && account.lockedUntil().isAfter(Instant.now())) {
			passwordEncoder.matches(password, account.passwordHash());
			throw ApiException.unauthorized();
		}
		if (!passwordEncoder.matches(password, account.passwordHash()) || !"ACTIVE".equals(account.status())) {
			if ("ACTIVE".equals(account.status())) {
				recordFailure(account, requestId);
			}
			throw ApiException.unauthorized();
		}
		if (account.twoStepEnabled()) {
			return new LoginResult(null, accessTokenService.issueTwoStepChallenge(account.userId(), account.clinicId()));
		}
		return new LoginResult(issue(account.userId(), account.clinicId(), account.displayName(), true, null, requestId), null);
	}

	/** Second step: a code from the authenticator app, or one of the user's recovery codes. */
	public IssuedSession completeTwoStep(String challengeToken, String code, String requestId) {
		UUID[] ids;
		try {
			ids = accessTokenService.readTwoStepChallenge(challengeToken);
		}
		catch (RuntimeException invalid) {
			throw new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "TWO_STEP_EXPIRED",
					"The sign-in took too long. Enter your email and password again.");
		}
		UUID userId = ids[0];
		UUID clinicId = ids[1];
		Boolean accepted = transactionTemplate.execute(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			return twoStepService.verifyLoginCode(clinicId, userId, code);
		});
		if (!Boolean.TRUE.equals(accepted)) {
			throw new ApiException(org.springframework.http.HttpStatus.UNAUTHORIZED, "TWO_STEP_INVALID", "That code is not right. Try the latest code from your app.");
		}
		return issue(userId, clinicId, null, true, null, requestId);
	}

	public IssuedSession refresh(String refreshToken, String requestId) {
		if (refreshToken == null || refreshToken.isBlank()) {
			throw ApiException.unauthorized();
		}
		Optional<StoredRefreshToken> stored = findRefresh(TokenHasher.sha256(refreshToken));
		if (stored.isEmpty()) {
			throw ApiException.unauthorized();
		}
		StoredRefreshToken token = stored.get();
		if (token.revokedAt() != null || token.expiresAt().isBefore(Instant.now())) {
			if (token.revokedAt() != null) {
				revokeFamily(token);
			}
			throw ApiException.unauthorized();
		}
		return issue(token.userId(), token.clinicId(), null, false, token, requestId);
	}

	public void logout(String refreshToken, String requestId) {
		if (refreshToken == null || refreshToken.isBlank()) {
			return;
		}
		findRefresh(TokenHasher.sha256(refreshToken)).ifPresent(token -> transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(token.clinicId());
			jdbcTemplate.update("update refresh_tokens set revoked_at = now() where id = ? and revoked_at is null", token.tokenId());
			auditRecorder.record(token.clinicId(), token.userId(), "LOGOUT", "user", token.userId(), requestId);
		}));
	}

	private IssuedSession issue(
			UUID userId,
			UUID clinicId,
			String knownDisplayName,
			boolean resetFailures,
			StoredRefreshToken previous,
			String requestId) {
		return transactionTemplate.execute(status -> {
			tenantTransactionSupport.setClinic(clinicId);
			String displayName = knownDisplayName == null ? loadDisplayName(userId) : knownDisplayName;
			List<String> roles = loadRoles(userId);
			boolean twoStepSetupRequired = twoStepService.setupRequired(userId, roles);
			if (resetFailures) {
				jdbcTemplate.update(
						"update users set failed_login_count = 0, locked_until = null, updated_at = now() where id = ?",
						userId);
			}
			UUID tokenId = UuidV7.generate();
			UUID familyId = previous == null ? UuidV7.generate() : previous.familyId();
			String refreshToken = TokenHasher.newRefreshToken();
			Instant expiresAt = Instant.now().plus(properties.jwt().refreshTtl());
			if (previous != null) {
				jdbcTemplate.update(
						"update refresh_tokens set revoked_at = now(), replaced_by_id = ? where id = ?",
						tokenId,
						previous.tokenId());
			}
			jdbcTemplate.update("""
					insert into refresh_tokens (id, clinic_id, user_id, family_id, token_hash, expires_at)
					values (?, ?, ?, ?, ?, ?)
					""",
					tokenId,
					clinicId,
					userId,
					familyId,
					TokenHasher.sha256(refreshToken),
					Timestamp.from(expiresAt));
			auditRecorder.record(
					clinicId,
					userId,
					previous == null ? "LOGIN_SUCCEEDED" : "REFRESH_ROTATED",
					"user",
					userId,
					requestId);
			String accessToken = accessTokenService.issue(userId, clinicId, displayName, roles, twoStepSetupRequired);
			return new IssuedSession(new SessionUser(userId, clinicId, displayName, roles, twoStepSetupRequired), accessToken, refreshToken);
		});
	}

	private void recordFailure(LoginAccount account, String requestId) {
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(account.clinicId());
			int next = account.failedLoginCount() + 1;
			OffsetDateTime lockedUntil = next >= LOCK_AFTER_FAILURES
					? OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(15)
					: null;
			jdbcTemplate.update(
					"update users set failed_login_count = ?, locked_until = ?, updated_at = now() where id = ?",
					next,
					lockedUntil == null ? null : Timestamp.from(lockedUntil.toInstant()),
					account.userId());
			auditRecorder.record(account.clinicId(), account.userId(), "LOGIN_FAILED", "user", account.userId(), requestId);
		});
	}

	private void revokeFamily(StoredRefreshToken token) {
		transactionTemplate.executeWithoutResult(status -> {
			tenantTransactionSupport.setClinic(token.clinicId());
			jdbcTemplate.update("""
					update refresh_tokens
					set revoked_at = coalesce(revoked_at, now()),
					    reuse_detected_at = coalesce(reuse_detected_at, now())
					where family_id = ?
					""", token.familyId());
		});
	}

	private Optional<LoginAccount> findLogin(String email) {
		List<LoginAccount> rows = jdbcTemplate.query("""
				select user_id, clinic_id, password_hash, status, display_name, failed_login_count, locked_until, two_step_enabled
				from app.find_login(?)
				""",
				(rs, row) -> new LoginAccount(
						rs.getObject("user_id", UUID.class),
						rs.getObject("clinic_id", UUID.class),
						rs.getString("password_hash"),
						rs.getString("status"),
						rs.getString("display_name"),
						rs.getInt("failed_login_count"),
						rs.getTimestamp("locked_until") == null ? null : rs.getTimestamp("locked_until").toInstant(),
						rs.getBoolean("two_step_enabled")),
				email);
		return rows.stream().findFirst();
	}

	private Optional<StoredRefreshToken> findRefresh(String hash) {
		List<StoredRefreshToken> rows = jdbcTemplate.query("""
				select token_id, clinic_id, user_id, family_id, expires_at, revoked_at
				from app.find_refresh_token(?)
				""",
				(rs, row) -> new StoredRefreshToken(
						rs.getObject("token_id", UUID.class),
						rs.getObject("clinic_id", UUID.class),
						rs.getObject("user_id", UUID.class),
						rs.getObject("family_id", UUID.class),
						rs.getTimestamp("expires_at").toInstant(),
						rs.getTimestamp("revoked_at") == null ? null : rs.getTimestamp("revoked_at").toInstant()),
				hash);
		return rows.stream().findFirst();
	}

	private String loadDisplayName(UUID userId) {
		return jdbcTemplate.queryForObject("select display_name from users where id = ?", String.class, userId);
	}

	private List<String> loadRoles(UUID userId) {
		return jdbcTemplate.query("select role_code from user_roles where user_id = ? order by role_code",
				(rs, row) -> rs.getString("role_code"),
				userId);
	}

	public record IssuedSession(SessionUser user, String accessToken, String refreshToken) {
	}

	/** Either a session, or a two-step challenge token when the account uses an authenticator app. */
	public record LoginResult(IssuedSession session, String twoStepChallenge) {
	}

	private record LoginAccount(
			UUID userId,
			UUID clinicId,
			String passwordHash,
			String status,
			String displayName,
			int failedLoginCount,
			Instant lockedUntil,
			boolean twoStepEnabled) {
	}

	private record StoredRefreshToken(
			UUID tokenId,
			UUID clinicId,
			UUID userId,
			UUID familyId,
			Instant expiresAt,
			Instant revokedAt) {
	}

}
