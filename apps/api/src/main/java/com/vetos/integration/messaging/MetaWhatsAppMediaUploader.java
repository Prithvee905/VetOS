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
		WhatsAppMessagingSupport.requireLiveConfiguration(properties);
		if (pdfBytes == null || pdfBytes.length < 200) {
			throw new IllegalStateException("Invoice PDF is empty or too small to send on WhatsApp.");
		}
		String accessToken = WhatsAppMessagingSupport.accessToken(properties);
		String mediaUrl = WhatsAppMessagingSupport.resolveMediaUrl(properties);
		if (!StringUtils.hasText(mediaUrl)) {
			throw new IllegalStateException("Could not resolve Meta WhatsApp media upload URL.");
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
			if (!StringUtils.hasText(mediaId)) {
				throw new IllegalStateException("Meta WhatsApp media upload did not return a media id.");
			}
			log.info("Uploaded WhatsApp document media id={} filename={}", mediaId, safeName);
			return mediaId;
		}
		catch (Exception ex) {
			log.error("Failed to upload WhatsApp media: {}", ex.getMessage(), ex);
			throw ex;
		}
	}

	public static String phoneNumberIdFromMessagesUrl(String messagesUrl) {
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
