package com.vetos.integration.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.platform.api.ApiException;
import com.vetos.platform.config.VetosProperties;
import com.vetos.platform.ids.UuidV7;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class WebhookService {

	private final JdbcTemplate jdbcTemplate;
	private final VetosProperties properties;
	private final ObjectMapper objectMapper;

	public WebhookService(JdbcTemplate jdbcTemplate, VetosProperties properties, ObjectMapper objectMapper) {
		this.jdbcTemplate = jdbcTemplate;
		this.properties = properties;
		this.objectMapper = objectMapper;
	}

	public String verifyWhatsApp(String mode, String verifyToken, String challenge) {
		if (!"subscribe".equals(mode)) {
			throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "INVALID_MODE", "Unsupported hub mode.");
		}
		String expected = properties.whatsApp().verifyToken();
		if (!StringUtils.hasText(expected) || !expected.equals(verifyToken)) {
			throw ApiException.forbidden();
		}
		return challenge;
	}

	public void ingestWhatsApp(String rawBody) {
		JsonNode root = parse(rawBody);
		String externalId = extractWhatsAppEventId(root);
		if (!StringUtils.hasText(externalId)) {
			externalId = UuidV7.generate().toString();
		}
		try {
			jdbcTemplate.update("""
					insert into provider_webhook_events (id, provider, external_event_id, clinic_id, payload)
					values (?, 'whatsapp', ?, null, ?::jsonb)
					""",
					UuidV7.generate(),
					externalId,
					rawBody);
		}
		catch (DuplicateKeyException duplicate) {
			return;
		}
	}

	private JsonNode parse(String rawBody) {
		try {
			return objectMapper.readTree(rawBody);
		}
		catch (Exception exception) {
			throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, "INVALID_JSON", "Webhook body must be JSON.");
		}
	}

	private static String extractWhatsAppEventId(JsonNode root) {
		JsonNode entry = root.path("entry").path(0);
		String entryId = entry.path("id").asText(null);
		JsonNode change = entry.path("changes").path(0).path("value");
		String messageId = change.path("messages").path(0).path("id").asText(null);
		if (StringUtils.hasText(messageId)) {
			return messageId;
		}
		return entryId;
	}

}
