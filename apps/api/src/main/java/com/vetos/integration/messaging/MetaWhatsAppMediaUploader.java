package com.vetos.integration.messaging;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.platform.config.VetosProperties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Component
public class MetaWhatsAppMediaUploader {

	private static final Logger log = LoggerFactory.getLogger(MetaWhatsAppMediaUploader.class);
	private static final Pattern PHONE_ID_IN_MESSAGES_URL = Pattern.compile("/(\\d+)/messages/?$");

	private final VetosProperties properties;
	private final RestClient restClient;
	private final ObjectMapper objectMapper;

	public MetaWhatsAppMediaUploader(VetosProperties properties, ObjectMapper objectMapper) {
		this.properties = properties;
		this.objectMapper = objectMapper;
		this.restClient = RestClient.create();
	}

	public String uploadPdf(byte[] pdfBytes, String filename) {
		String baseUrl = properties.whatsApp().apiBaseUrl();
		String accessToken = properties.whatsApp().accessToken();
		if (!StringUtils.hasText(baseUrl) || !StringUtils.hasText(accessToken)) {
			log.warn("WhatsApp not configured; skipping media upload.");
			return null;
		}
		String phoneNumberId = phoneNumberIdFromMessagesUrl(baseUrl);
		if (!StringUtils.hasText(phoneNumberId)) {
			log.warn("Could not parse phone number id from WhatsApp api base URL.");
			return null;
		}
		String mediaUrl = baseUrl.replaceAll("/messages/?$", "/media");
		if (!mediaUrl.endsWith("/media")) {
			mediaUrl = "https://graph.facebook.com/v23.0/" + phoneNumberId + "/media";
		}

		String safeName = StringUtils.hasText(filename) ? filename : "invoice.pdf";
		ByteArrayResource fileResource = new ByteArrayResource(pdfBytes) {
			@Override
			public String getFilename() {
				return safeName;
			}
		};
		MultiValueMap<String, Object> multipart = new LinkedMultiValueMap<>();
		multipart.add("messaging_product", "whatsapp");
		multipart.add("type", "application/pdf");
		multipart.add("file", fileResource);

		try {
			String response = restClient.post()
					.uri(mediaUrl)
					.contentType(MediaType.MULTIPART_FORM_DATA)
					.header("Authorization", "Bearer " + accessToken)
					.body(multipart)
					.retrieve()
					.body(String.class);
			String mediaId = extractMediaId(response);
			log.info("Uploaded WhatsApp document media id={} filename={}", mediaId, safeName);
			return mediaId;
		}
		catch (Exception ex) {
			log.error("Failed to upload WhatsApp media: {}", ex.getMessage(), ex);
			throw ex;
		}
	}

	static String phoneNumberIdFromMessagesUrl(String messagesUrl) {
		if (!StringUtils.hasText(messagesUrl)) {
			return null;
		}
		Matcher matcher = PHONE_ID_IN_MESSAGES_URL.matcher(messagesUrl.trim());
		if (matcher.find()) {
			return matcher.group(1);
		}
		return null;
	}

	private String extractMediaId(String responseJson) {
		if (!StringUtils.hasText(responseJson)) {
			return null;
		}
		try {
			JsonNode root = objectMapper.readTree(responseJson);
			return root.path("id").asText(null);
		}
		catch (Exception ignored) {
			return null;
		}
	}

}
