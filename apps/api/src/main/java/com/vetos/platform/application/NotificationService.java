package com.vetos.platform.application;

import com.vetos.platform.api.ApiException;
import com.vetos.platform.ids.UuidV7;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class NotificationService {

	private final JdbcTemplate jdbcTemplate;

	public NotificationService(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public void notifyClinic(UUID clinicId, UUID userId, String title, String body, String category) {
		jdbcTemplate.update("""
				insert into in_app_notifications (id, clinic_id, user_id, title, body, category, created_at)
				values (?, ?, ?, ?, ?, ?, now())
				""",
				UuidV7.generate(), clinicId, userId, title, body, category);
	}

	public void notifyOwners(UUID clinicId, String title, String body, String category) {
		List<UUID> owners = jdbcTemplate.query("""
				select u.id from users u
				join user_roles ur on ur.user_id = u.id and ur.clinic_id = u.clinic_id
				where u.clinic_id = ? and ur.role_code = 'OWNER' and u.deleted_at is null
				""",
				(rs, rowNum) -> rs.getObject("id", UUID.class),
				clinicId);
		for (UUID ownerId : owners) {
			notifyClinic(clinicId, ownerId, title, body, category);
		}
	}

	@Transactional(readOnly = true, noRollbackFor = ApiException.class)
	public NotificationPage listForUser(UUID clinicId, UUID userId, int page, int size) {
		int offset = page * size;
		Long total = jdbcTemplate.queryForObject("""
				select count(*) from in_app_notifications
				where clinic_id = ? and (user_id is null or user_id = ?)
				""", Long.class, clinicId, userId);
		List<NotificationDto> items = jdbcTemplate.query("""
				select id, title, body, category, read_at, created_at
				from in_app_notifications
				where clinic_id = ? and (user_id is null or user_id = ?)
				order by created_at desc
				limit ? offset ?
				""",
				(rs, rowNum) -> new NotificationDto(
						rs.getObject("id", UUID.class),
						rs.getString("title"),
						rs.getString("body"),
						rs.getString("category"),
						rs.getTimestamp("read_at") == null ? null : rs.getTimestamp("read_at").toInstant(),
						rs.getTimestamp("created_at").toInstant()),
				clinicId, userId, size, offset);
		return new NotificationPage(items, total == null ? 0 : total);
	}

	public long unreadCount(UUID clinicId, UUID userId) {
		Long count = jdbcTemplate.queryForObject("""
				select count(*) from in_app_notifications
				where clinic_id = ? and (user_id is null or user_id = ?) and read_at is null
				""", Long.class, clinicId, userId);
		return count == null ? 0 : count;
	}

	public void markRead(UUID clinicId, UUID userId, UUID notificationId) {
		int updated = jdbcTemplate.update("""
				update in_app_notifications set read_at = now()
				where id = ? and clinic_id = ? and (user_id is null or user_id = ?) and read_at is null
				""",
				notificationId, clinicId, userId);
		if (updated == 0) {
			throw ApiException.notFound();
		}
	}

	public void markAllRead(UUID clinicId, UUID userId) {
		jdbcTemplate.update("""
				update in_app_notifications set read_at = now()
				where clinic_id = ? and (user_id is null or user_id = ?) and read_at is null
				""",
				clinicId, userId);
	}

	public record NotificationDto(UUID id, String title, String body, String category, Instant readAt, Instant createdAt) {
	}

	public record NotificationPage(List<NotificationDto> items, long total) {
	}

}
