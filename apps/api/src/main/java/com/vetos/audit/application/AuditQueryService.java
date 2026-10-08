package com.vetos.audit.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class AuditQueryService {

	private final JdbcTemplate jdbcTemplate;

	public AuditQueryService(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public AuditPageResponse listAuditEvents(UUID clinicId, int page, int size) {
		int safePage = Math.max(page, 0);
		int safeSize = Math.min(Math.max(size, 1), 100);
		int offset = safePage * safeSize;

		Integer total = jdbcTemplate.queryForObject("""
				select count(*) from audit_events where clinic_id = ?
				""", Integer.class, clinicId);

		List<AuditEventDto> items = jdbcTemplate.query("""
				select a.id, a.actor_user_id, coalesce(u.display_name, 'System') as actor_name,
				       a.action, a.entity_type, a.entity_id, a.request_id, a.created_at
				from audit_events a
				left join users u on u.id = a.actor_user_id and u.clinic_id = a.clinic_id
				where a.clinic_id = ?
				order by a.created_at desc
				limit ? offset ?
				""",
				(rs, rowNum) -> new AuditEventDto(
						rs.getObject("id", UUID.class),
						rs.getObject("actor_user_id", UUID.class),
						rs.getString("actor_name"),
						rs.getString("action"),
						rs.getString("entity_type"),
						rs.getObject("entity_id", UUID.class),
						rs.getString("request_id"),
						rs.getTimestamp("created_at").toInstant()),
				clinicId, safeSize, offset);

		return new AuditPageResponse(items, safePage, safeSize, total == null ? 0 : total);
	}

	public record AuditEventDto(
			UUID id,
			UUID actorUserId,
			String actorName,
			String action,
			String entityType,
			UUID entityId,
			String requestId,
			Instant createdAt) {}

	public record AuditPageResponse(
			List<AuditEventDto> items,
			int page,
			int size,
			int total) {}
}
