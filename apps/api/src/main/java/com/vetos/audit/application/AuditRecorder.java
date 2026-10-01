package com.vetos.audit.application;

import com.vetos.platform.ids.UuidV7;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class AuditRecorder {

	private final JdbcTemplate jdbcTemplate;

	public AuditRecorder(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public void record(UUID clinicId, UUID actorUserId, String action, String entityType, UUID entityId, String requestId) {
		jdbcTemplate.update("""
				insert into audit_events (id, clinic_id, actor_user_id, action, entity_type, entity_id, request_id)
				values (?, ?, ?, ?, ?, ?, ?)
				""",
				UuidV7.generate(),
				clinicId,
				actorUserId,
				action,
				entityType,
				entityId,
				requestId);
	}

}
