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
		applyDeliveryStatuses(root);
	}

	private void applyDeliveryStatuses(JsonNode root) {
		for (JsonNode entry : root.path("entry")) {
			for (JsonNode change : entry.path("changes")) {
				JsonNode value = change.path("value");
				for (JsonNode statusNode : value.path("statuses")) {
					String messageId = statusNode.path("id").asText(null);
					String status = statusNode.path("status").asText(null);
					if (!StringUtils.hasText(messageId) || !StringUtils.hasText(status)) {
						continue;
					}
					String deliveryStatus = mapDeliveryStatus(status);
					String errorDetail = extractStatusError(statusNode);
					String lastError = "FAILED".equals(deliveryStatus) ? errorDetail : null;
					jdbcTemplate.queryForObject(
							"select app.apply_whatsapp_delivery_status(?, ?, ?)",
							Integer.class,
							messageId,
							deliveryStatus,
							lastError);
				}
			}
		}
	}

	private static String mapDeliveryStatus(String metaStatus) {
		return switch (metaStatus.toLowerCase()) {
			case "sent" -> "SENT";
			case "delivered" -> "DELIVERED";
			case "read" -> "READ";
			case "failed" -> "FAILED";
			default -> metaStatus.toUpperCase();
		};
	}

	private static String extractStatusError(JsonNode statusNode) {
		JsonNode errors = statusNode.path("errors");
		if (errors.isArray() && !errors.isEmpty()) {
			JsonNode first = errors.get(0);
			String title = first.path("title").asText("");
			String message = first.path("message").asText("");
			return (title + " " + message).trim();
		}
		return "Delivery failed";
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
		String statusId = change.path("statuses").path(0).path("id").asText(null);
		if (StringUtils.hasText(statusId)) {
			return statusId + ":" + change.path("statuses").path(0).path("status").asText("unknown");
		}
		return entryId;
	}

}
