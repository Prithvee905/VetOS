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
public class ConfigurableEmailClient implements EmailClient {

	private static final Logger log = LoggerFactory.getLogger(ConfigurableEmailClient.class);

	private final VetosProperties properties;
	private final RestClient restClient;
	private final ObjectMapper objectMapper;

	public ConfigurableEmailClient(VetosProperties properties, ObjectMapper objectMapper) {
		this.properties = properties;
		this.objectMapper = objectMapper;
		this.restClient = RestClient.create();
	}

	@Override
	public void send(EmailMessage message) {
		String baseUrl = properties.email().apiBaseUrl();
		if (!StringUtils.hasText(baseUrl)) {
			log.info("Email stub send to={} subject={}", message.to(), message.subject());
			return;
		}
		String apiKey = properties.email().apiKey();
		if (!StringUtils.hasText(apiKey)) {
			throw new IllegalStateException("vetos.email.api-key is required when api-base-url is set.");
		}
		Map<String, Object> body = Map.of(
				"from", properties.email().fromAddress(),
				"to", message.to(),
				"subject", message.subject(),
				"text", message.textBody());
		restClient.post()
				.uri(baseUrl)
				.contentType(MediaType.APPLICATION_JSON)
				.header("Authorization", "Bearer " + apiKey)
				.body(objectMapper.valueToTree(body).toString())
				.retrieve()
				.toBodilessEntity();
	}

}
