package com.vetos.integration.outbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.integration.messaging.WhatsAppClient;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class WhatsAppOutboxHandler implements OutboxHandler {

	private final WhatsAppClient whatsAppClient;
	private final ObjectMapper objectMapper;
	private final JdbcTemplate jdbcTemplate;

	public WhatsAppOutboxHandler(WhatsAppClient whatsAppClient, ObjectMapper objectMapper, JdbcTemplate jdbcTemplate) {
		this.whatsAppClient = whatsAppClient;
		this.objectMapper = objectMapper;
		this.jdbcTemplate = jdbcTemplate;
	}

	@Override
	public String eventType() {
		return "WHATSAPP_MESSAGE";
	}

	@Override
	public void handle(UUID clinicId, UUID outboxEventId, String payloadJson) throws Exception {
		JsonNode root = objectMapper.readTree(payloadJson);
		boolean sessionMessage = root.path("sessionMessage").asBoolean(false);
		List<String> templateParams = new ArrayList<>();
		if (root.has("templateParams") && root.get("templateParams").isArray()) {
			for (JsonNode node : root.get("templateParams")) {
				templateParams.add(node.asText(""));
			}
		}
		WhatsAppClient.WhatsAppSendResult result = whatsAppClient.sendTemplateMessage(new WhatsAppClient.WhatsAppMessage(
				root.get("to").asText(),
				root.path("template").asText("DEFAULT"),
				root.path("language").asText("en"),
				root.path("body").asText(""),
				templateParams,
				sessionMessage));
		if (StringUtils.hasText(result.providerMessageId())) {
			jdbcTemplate.update("""
					update outbox_events
					set provider_message_id = ?, delivery_status = 'SENT'
					where id = ? and clinic_id = ?
					""",
					result.providerMessageId(),
					outboxEventId,
					clinicId);
		}
	}

}
