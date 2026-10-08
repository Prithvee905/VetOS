package com.vetos.integration.application;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.platform.application.PlatformExpansionService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class CommunicationService {

	private final PlatformExpansionService platformExpansionService;
	private final ObjectMapper objectMapper;
	private final JdbcTemplate jdbcTemplate;

	public CommunicationService(PlatformExpansionService platformExpansionService, ObjectMapper objectMapper, JdbcTemplate jdbcTemplate) {
		this.platformExpansionService = platformExpansionService;
		this.objectMapper = objectMapper;
		this.jdbcTemplate = jdbcTemplate;
	}

	public void queueWhatsApp(UUID clinicId, WhatsAppRequest request) {
		platformExpansionService.enqueueOutbox(clinicId, "WHATSAPP_MESSAGE", toJson(Map.of(
				"to", request.to() == null ? "" : request.to(),
				"template", request.template() == null ? "DEFAULT" : request.template(),
				"language", request.language() == null ? "en" : request.language(),
				"body", request.body() == null ? "" : request.body())));
	}

	public void queueEmail(UUID clinicId, EmailRequest request) {
		platformExpansionService.enqueueOutbox(clinicId, "EMAIL_MESSAGE", toJson(Map.of(
				"to", request.to() == null ? "" : request.to(),
				"subject", request.subject() == null ? "Notification" : request.subject(),
				"body", request.body() == null ? "" : request.body())));
	}

	public List<OutboxEventDto> listOutboxEvents(UUID clinicId, int limit) {
		int safeLimit = Math.min(Math.max(limit, 1), 100);
		return jdbcTemplate.query("""
				select id, event_type, status, attempt_count, last_error, created_at, processed_at
				from outbox_events
				where clinic_id = ?
				order by created_at desc
				limit ?
				""",
				(rs, rowNum) -> new OutboxEventDto(
						rs.getObject("id", UUID.class),
						rs.getString("event_type"),
						rs.getString("status"),
						rs.getInt("attempt_count"),
						rs.getString("last_error"),
						rs.getTimestamp("created_at").toInstant(),
						rs.getTimestamp("processed_at") == null ? null : rs.getTimestamp("processed_at").toInstant()),
				clinicId, safeLimit);
	}

	private String toJson(Map<String, String> payload) {
		try {
			return objectMapper.writeValueAsString(payload);
		}
		catch (JsonProcessingException exception) {
			throw new IllegalArgumentException("Invalid message payload.");
		}
	}

	public record WhatsAppRequest(String to, String template, String language, String body) {}
	public record EmailRequest(String to, String subject, String body) {}
	public record OutboxEventDto(UUID id, String eventType, String status, int attemptCount, String lastError, Instant createdAt, Instant processedAt) {}
}
