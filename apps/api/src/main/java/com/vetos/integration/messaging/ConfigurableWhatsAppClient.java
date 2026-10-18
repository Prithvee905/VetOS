package com.vetos.integration.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.platform.config.VetosProperties;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Component
public class ConfigurableWhatsAppClient implements WhatsAppClient {

	private static final Logger log = LoggerFactory.getLogger(ConfigurableWhatsAppClient.class);

	private final VetosProperties properties;
	private final RestClient restClient;
	private final ObjectMapper objectMapper;

	public ConfigurableWhatsAppClient(VetosProperties properties, ObjectMapper objectMapper) {
		this.properties = properties;
		this.objectMapper = objectMapper;
		this.restClient = RestClient.create();
	}

	@Override
	public void sendTemplateMessage(WhatsAppMessage message) {
		String baseUrl = properties.whatsApp().apiBaseUrl();
		if (!StringUtils.hasText(baseUrl)) {
			log.info("WhatsApp stub send to={} template={} preview={}", message.toPhoneE164(), message.templateName(), message.bodyPreview());
			return;
		}
		String accessToken = properties.whatsApp().accessToken();
		if (!StringUtils.hasText(accessToken)) {
			log.warn("WhatsApp access token not configured, skipping send to={}", message.toPhoneE164());
			return;
		}

		String cleanPhone = message.toPhoneE164() != null ? message.toPhoneE164().replaceAll("[^0-9]", "") : "";
		if (cleanPhone.length() == 10) {
			cleanPhone = "91" + cleanPhone;
		}

		if (cleanPhone.isBlank()) {
			log.warn("Cannot send WhatsApp message: recipient phone is empty.");
			return;
		}

		Map<String, Object> body;
		if ("hello_world".equalsIgnoreCase(message.templateName())) {
			body = Map.of(
					"messaging_product", "whatsapp",
					"to", cleanPhone,
					"type", "template",
					"template", Map.of(
							"name", "hello_world",
							"language", Map.of("code", "en_US")));
		} else {
			String textContent = StringUtils.hasText(message.bodyPreview())
					? message.bodyPreview()
					: "🐾 VetOS Clinic Alert: Follow-up update regarding your pet.";
			body = Map.of(
					"messaging_product", "whatsapp",
					"recipient_type", "individual",
					"to", cleanPhone,
					"type", "text",
					"text", Map.of(
							"preview_url", false,
							"body", textContent));
		}

		try {
			String response = restClient.post()
					.uri(baseUrl)
					.contentType(MediaType.APPLICATION_JSON)
					.header("Authorization", "Bearer " + accessToken)
					.body(objectMapper.valueToTree(body).toString())
					.retrieve()
					.body(String.class);
			log.info("WhatsApp message successfully dispatched to {}! Meta response: {}", cleanPhone, response);
		} catch (Exception ex) {
			log.error("Failed to send WhatsApp message to {}: {}", cleanPhone, ex.getMessage(), ex);
			throw ex;
		}
	}

}
