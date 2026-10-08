package com.vetos.integration.outbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.integration.messaging.EmailClient;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class EmailOutboxHandler implements OutboxHandler {

	private final EmailClient emailClient;
	private final ObjectMapper objectMapper;

	public EmailOutboxHandler(EmailClient emailClient, ObjectMapper objectMapper) {
		this.emailClient = emailClient;
		this.objectMapper = objectMapper;
	}

	@Override
	public String eventType() {
		return "EMAIL_MESSAGE";
	}

	@Override
	public void handle(UUID clinicId, String payloadJson) throws Exception {
		JsonNode root = objectMapper.readTree(payloadJson);
		emailClient.send(new EmailClient.EmailMessage(
				root.get("to").asText(),
				root.get("subject").asText(),
				root.path("body").asText("")));
	}

}
