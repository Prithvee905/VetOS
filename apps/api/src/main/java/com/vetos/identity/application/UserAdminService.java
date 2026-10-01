package com.vetos.identity.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.clinic.infrastructure.BranchRepository;
import com.vetos.identity.api.UserController.UserCreateRequest;
import com.vetos.identity.api.UserController.UserPage;
import com.vetos.identity.api.UserController.UserResponse;
import com.vetos.identity.api.UserController.UserUpdateRequest;
import com.vetos.identity.infrastructure.UserEntity;
import com.vetos.identity.infrastructure.UserRepository;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserAdminService {

	private final UserRepository userRepository;
	private final BranchRepository branchRepository;
	private final JdbcTemplate jdbcTemplate;
	private final PasswordEncoder passwordEncoder;
	private final AuditRecorder auditRecorder;

	public UserAdminService(
			UserRepository userRepository,
			BranchRepository branchRepository,
			JdbcTemplate jdbcTemplate,
			PasswordEncoder passwordEncoder,
			AuditRecorder auditRecorder) {
		this.userRepository = userRepository;
		this.branchRepository = branchRepository;
		this.jdbcTemplate = jdbcTemplate;
		this.passwordEncoder = passwordEncoder;
		this.auditRecorder = auditRecorder;
	}

	@Transactional(readOnly = true)
	public UserPage list(int page, int size) {
		int safePage = Math.max(page, 0);
		int safeSize = Math.min(Math.max(size, 1), 100);
		List<UserEntity> rows = userRepository.findByDeletedAtIsNullOrderByCreatedAtDescIdDesc(PageRequest.of(safePage, safeSize + 1));
		boolean hasNext = rows.size() > safeSize;
		List<UserEntity> pageRows = rows.stream().limit(safeSize).toList();
		Map<UUID, List<String>> rolesByUser = loadRoles(pageRows.stream().map(UserEntity::getId).toList());
		List<UserResponse> items = pageRows.stream()
				.map(user -> toResponse(user, rolesByUser.getOrDefault(user.getId(), List.of())))
				.toList();
		return new UserPage(items, safePage, safeSize, hasNext);
	}

	@Transactional
	public UserResponse create(UUID clinicId, UUID actorUserId, UserCreateRequest request, String requestId) {
		validateRoles(request.roles());
		if (userRepository.existsByEmailIgnoreCaseAndDeletedAtIsNull(request.email())) {
			throw ApiException.conflict("A user with that email already exists.");
		}
		if (request.branchId() != null && branchRepository.findById(request.branchId()).isEmpty()) {
			throw ApiException.notFound();
		}
		Instant now = Instant.now();
		UserEntity user = new UserEntity();
		UUID userId = UuidV7.generate();
		user.setId(userId);
		user.setClinicId(clinicId);
		user.setBranchId(request.branchId());
		user.setEmail(request.email().trim());
		user.setPasswordHash(passwordEncoder.encode(request.password()));
		user.setDisplayName(request.displayName().trim());
		user.setStatus("ACTIVE");
		user.setCreatedAt(now);
		user.setUpdatedAt(now);
		userRepository.save(user);
		replaceRoles(userId, clinicId, request.roles());
		auditRecorder.record(clinicId, actorUserId, "CREATE", "user", userId, requestId);
		return toResponse(user, request.roles());
	}

	@Transactional
	public UserResponse update(UUID clinicId, UUID actorUserId, UUID userId, UserUpdateRequest request, String requestId) {
		UserEntity user = userRepository.findByIdAndDeletedAtIsNull(userId).orElseThrow(ApiException::notFound);
		if (request.version() != user.getVersion()) {
			throw ApiException.versionConflict();
		}
		if (request.branchId() != null) {
			if (branchRepository.findById(request.branchId()).isEmpty()) {
				throw ApiException.notFound();
			}
			user.setBranchId(request.branchId());
		}
		if (request.displayName() != null) {
			user.setDisplayName(request.displayName().trim());
		}
		if (request.status() != null) {
			user.setStatus(request.status());
		}
		if (request.roles() != null) {
			validateRoles(request.roles());
			replaceRoles(userId, clinicId, request.roles());
		}
		user.setUpdatedAt(Instant.now());
		UserEntity saved = userRepository.save(user);
		List<String> roles = loadRoles(List.of(userId)).getOrDefault(userId, List.of());
		auditRecorder.record(clinicId, actorUserId, "UPDATE", "user", userId, requestId);
		return toResponse(saved, roles);
	}

	private void validateRoles(List<String> roles) {
		if (roles == null || roles.isEmpty()) {
			throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "At least one role is required.");
		}
		LinkedHashSet<String> unique = new LinkedHashSet<>(roles);
		if (unique.size() != roles.size()) {
			throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Roles must be unique.");
		}
		for (String role : roles) {
			if (!RolePermissions.isAssignableRole(role)) {
				throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Role is not assignable.");
			}
		}
	}

	private void replaceRoles(UUID userId, UUID clinicId, List<String> roles) {
		jdbcTemplate.update("delete from user_roles where user_id = ? and clinic_id = ?", userId, clinicId);
		for (String role : roles) {
			jdbcTemplate.update(
					"insert into user_roles (user_id, role_code, clinic_id) values (?, ?, ?)",
					userId,
					role,
					clinicId);
		}
	}

	private Map<UUID, List<String>> loadRoles(List<UUID> userIds) {
		if (userIds.isEmpty()) {
			return Map.of();
		}
		String placeholders = String.join(",", java.util.Collections.nCopies(userIds.size(), "?"));
		Object[] args = userIds.toArray();
		Map<UUID, List<String>> roles = new HashMap<>();
		jdbcTemplate.query(
				"select user_id, role_code from user_roles where user_id in (" + placeholders + ") order by role_code",
				rs -> {
					UUID userId = rs.getObject("user_id", UUID.class);
					roles.computeIfAbsent(userId, ignored -> new java.util.ArrayList<>()).add(rs.getString("role_code"));
				},
				args);
		return roles;
	}

	private static UserResponse toResponse(UserEntity user, List<String> roles) {
		return new UserResponse(
				user.getId(),
				user.getEmail(),
				user.getDisplayName(),
				user.getStatus(),
				user.getBranchId(),
				roles,
				user.getVersion());
	}

}
