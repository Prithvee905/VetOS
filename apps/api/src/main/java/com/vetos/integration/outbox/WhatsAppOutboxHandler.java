package com.vetos.integration.outbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.integration.messaging.WhatsAppClient;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class WhatsAppOutboxHandler implements OutboxHandler {

	private final WhatsAppClient whatsAppClient;
	private final ObjectMapper objectMapper;

	public WhatsAppOutboxHandler(WhatsAppClient whatsAppClient, ObjectMapper objectMapper) {
		this.whatsAppClient = whatsAppClient;
		this.objectMapper = objectMapper;
	}

	@Override
	public String eventType() {
		return "WHATSAPP_MESSAGE";
	}

	@Override
	public void handle(UUID clinicId, String payloadJson) throws Exception {
		JsonNode root = objectMapper.readTree(payloadJson);
		whatsAppClient.sendTemplateMessage(new WhatsAppClient.WhatsAppMessage(
				root.get("to").asText(),
				root.path("template").asText("appointment_reminder"),
				root.path("language").asText("en"),
				root.path("body").asText("")));
	}

}
