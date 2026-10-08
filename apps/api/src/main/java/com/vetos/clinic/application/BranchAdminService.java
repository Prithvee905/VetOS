package com.vetos.clinic.application;

import com.vetos.audit.application.AuditRecorder;
import com.vetos.clinic.api.BranchController.BranchResponse;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(noRollbackFor = ApiException.class)
public class BranchAdminService {

	private final JdbcTemplate jdbcTemplate;
	private final AuditRecorder auditRecorder;

	public BranchAdminService(JdbcTemplate jdbcTemplate, AuditRecorder auditRecorder) {
		this.jdbcTemplate = jdbcTemplate;
		this.auditRecorder = auditRecorder;
	}

	public BranchResponse create(UUID clinicId, UUID actorId, BranchCreateRequest request, String requestId) {
		UUID id = UuidV7.generate();
		Instant now = Instant.now();
		jdbcTemplate.update("""
				insert into branches (id, clinic_id, name, status, created_at, updated_at, created_by, updated_by)
				values (?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
				""",
				id, clinicId, request.name(), Timestamp.from(now), Timestamp.from(now), actorId, actorId);
		auditRecorder.record(clinicId, actorId, "CREATE", "branch", id, requestId);
		return new BranchResponse(id, request.name(), "ACTIVE");
	}

	public record BranchCreateRequest(String name) {
	}

}
