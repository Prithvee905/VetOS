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
			throw new IllegalStateException("vetos.whatsapp.access-token is required when api-base-url is set.");
		}
		Map<String, Object> body = Map.of(
				"messaging_product", "whatsapp",
				"to", message.toPhoneE164(),
				"type", "template",
				"template", Map.of(
						"name", message.templateName(),
						"language", Map.of("code", message.languageCode())));
		restClient.post()
				.uri(baseUrl)
				.contentType(MediaType.APPLICATION_JSON)
				.header("Authorization", "Bearer " + accessToken)
				.body(objectMapper.valueToTree(body).toString())
				.retrieve()
				.toBodilessEntity();
	}

}
