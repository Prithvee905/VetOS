package com.vetos.integration.messaging;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.vetos.platform.config.VetosProperties;
import java.util.ArrayList;
import java.util.List;
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
	public WhatsAppSendResult sendTemplateMessage(WhatsAppMessage message) {
		String baseUrl = properties.whatsApp().apiBaseUrl();
		if (!StringUtils.hasText(baseUrl)) {
			log.info("WhatsApp stub send to={} template={} preview={}", message.toPhoneE164(), message.templateName(), message.bodyPreview());
			return new WhatsAppSendResult(null);
		}
		String accessToken = properties.whatsApp().accessToken();
		if (!StringUtils.hasText(accessToken)) {
			log.warn("WhatsApp access token not configured, skipping send to={}", message.toPhoneE164());
			return new WhatsAppSendResult(null);
		}

		String cleanPhone = normalizePhone(message.toPhoneE164());
		if (cleanPhone.isBlank()) {
			log.warn("Cannot send WhatsApp message: recipient phone is empty.");
			return new WhatsAppSendResult(null);
		}

		ObjectNode body = objectMapper.createObjectNode();
		body.put("messaging_product", "whatsapp");
		body.put("to", cleanPhone);

		if (message.sessionMessage()) {
			String textContent = StringUtils.hasText(message.bodyPreview())
					? message.bodyPreview()
					: "VetOS clinic update regarding your pet.";
			body.put("type", "text");
			ObjectNode text = body.putObject("text");
			text.put("preview_url", false);
			text.put("body", textContent);
		}
		else if ("hello_world".equalsIgnoreCase(message.templateName())
				|| "hello_world".equalsIgnoreCase(WhatsAppTemplateNames.toMetaTemplateName(message.templateName()))) {
			body.put("type", "template");
			ObjectNode template = body.putObject("template");
			template.put("name", "hello_world");
			template.putObject("language").put("code", "en_US");
		}
		else {
			String metaName = WhatsAppTemplateNames.toMetaTemplateName(message.templateName());
			String lang = resolveTemplateLanguage(metaName, message.languageCode());
			List<String> params = message.templateParams() == null ? List.of() : message.templateParams();
			if (params.isEmpty() && StringUtils.hasText(message.bodyPreview())) {
				params = fallbackParamsFromBody(metaName, message.bodyPreview());
			}
			body.put("type", "template");
			ObjectNode template = body.putObject("template");
			template.put("name", metaName);
			template.putObject("language").put("code", lang);
			ArrayNode componentsArray = null;
			if (StringUtils.hasText(message.headerDocumentMediaId())) {
				componentsArray = template.putArray("components");
				ObjectNode headerComponent = componentsArray.addObject();
				headerComponent.put("type", "header");
				ArrayNode headerParameters = headerComponent.putArray("parameters");
				ObjectNode docParam = headerParameters.addObject();
				docParam.put("type", "document");
				ObjectNode document = docParam.putObject("document");
				document.put("id", message.headerDocumentMediaId());
				if (StringUtils.hasText(message.headerDocumentFilename())) {
					document.put("filename", message.headerDocumentFilename());
				}
			}
			if (!params.isEmpty()) {
				if (componentsArray == null) {
					componentsArray = template.putArray("components");
				}
				ObjectNode bodyComponent = componentsArray.addObject();
				bodyComponent.put("type", "body");
				ArrayNode parameters = bodyComponent.putArray("parameters");
				for (String param : params) {
					ObjectNode p = parameters.addObject();
					p.put("type", "text");
					p.put("text", param == null ? "" : param);
				}
			}
		}

		try {
			String response = restClient.post()
					.uri(baseUrl)
					.contentType(MediaType.APPLICATION_JSON)
					.header("Authorization", "Bearer " + accessToken)
					.body(body.toString())
					.retrieve()
					.body(String.class);
			log.info("WhatsApp message dispatched to {} template={} meta response: {}", cleanPhone, message.templateName(), response);
			return new WhatsAppSendResult(extractMessageId(response));
		}
		catch (Exception ex) {
			log.error("Failed to send WhatsApp message to {}: {}", cleanPhone, ex.getMessage(), ex);
			throw ex;
		}
	}

	private static String resolveTemplateLanguage(String metaName, String requested) {
		if ("hello_world".equals(metaName)) {
			return "en_US";
		}
		if ("invoice_pdf_alert".equals(metaName) || "invoice_alert".equals(metaName)) {
			return "en";
		}
		return StringUtils.hasText(requested) ? requested : "en";
	}

	private static String normalizePhone(String raw) {
		String cleanPhone = raw != null ? raw.replaceAll("[^0-9]", "") : "";
		if (cleanPhone.length() == 10) {
			cleanPhone = "91" + cleanPhone;
		}
		return cleanPhone;
	}

	private List<String> fallbackParamsFromBody(String metaName, String bodyPreview) {
		List<String> params = new ArrayList<>();
		params.add("Pet Parent");
		if ("campaign_notice".equals(metaName)) {
			params.add("VetOS Clinic");
			params.add(bodyPreview.length() > 120 ? bodyPreview.substring(0, 120) : bodyPreview);
		}
		else {
			params.add("your pet");
			params.add(bodyPreview.length() > 80 ? bodyPreview.substring(0, 80) : bodyPreview);
		}
		return params;
	}

	private String extractMessageId(String responseJson) {
		if (!StringUtils.hasText(responseJson)) {
			return null;
		}
		try {
			JsonNode root = objectMapper.readTree(responseJson);
			JsonNode messages = root.path("messages");
			if (messages.isArray() && !messages.isEmpty()) {
				return messages.get(0).path("id").asText(null);
			}
		}
		catch (Exception ignored) {
		}
		return null;
	}

}
