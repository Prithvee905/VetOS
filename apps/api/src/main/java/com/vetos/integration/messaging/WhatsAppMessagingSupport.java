package com.vetos.integration.messaging;

import com.vetos.platform.config.VetosProperties;
import org.springframework.util.StringUtils;

public final class WhatsAppMessagingSupport {

	private static final String GRAPH_MESSAGES_TEMPLATE = "https://graph.facebook.com/v23.0/%s/messages";

	private WhatsAppMessagingSupport() {
	}

	public static String normalizeAccessToken(String raw) {
		if (raw == null) {
			return "";
		}
		String trimmed = raw.trim();
		if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
			trimmed = trimmed.substring(1, trimmed.length() - 1).trim();
		}
		return trimmed;
	}

	public static String accessToken(VetosProperties properties) {
		return normalizeAccessToken(properties.whatsApp().accessToken());
	}

	public static void requireLiveConfiguration(VetosProperties properties) {
		if (!StringUtils.hasText(accessToken(properties))) {
			throw new IllegalStateException(
					"META_WHATSAPP_TOKEN is not set on the API server. Add it to .env.production and redeploy.");
		}
		String messagesUrl = resolveMessagesUrl(properties);
		if (MetaWhatsAppMediaUploader.phoneNumberIdFromMessagesUrl(messagesUrl) == null) {
			throw new IllegalStateException(
					"META_WHATSAPP_PHONE_NUMBER_ID is missing or invalid. Set it in .env.production (or VETOS_WHATSAPP_API_BASE_URL).");
		}
	}

	public static String resolveMessagesUrl(VetosProperties properties) {
		String configured = properties.whatsApp().apiBaseUrl();
		if (isUsableMessagesUrl(configured)) {
			return configured.trim();
		}
		String phoneId = firstNonBlank(System.getenv("META_WHATSAPP_PHONE_NUMBER_ID"), System.getenv("VETOS_WHATSAPP_PHONE_NUMBER_ID"));
		if (StringUtils.hasText(phoneId)) {
			return String.format(GRAPH_MESSAGES_TEMPLATE, phoneId.trim());
		}
		return configured == null ? "" : configured.trim();
	}

	public static String resolveMediaUrl(VetosProperties properties) {
		String messagesUrl = resolveMessagesUrl(properties);
		String phoneId = MetaWhatsAppMediaUploader.phoneNumberIdFromMessagesUrl(messagesUrl);
		if (!StringUtils.hasText(phoneId)) {
			return "";
		}
		return "https://graph.facebook.com/v23.0/" + phoneId + "/media";
	}

	private static boolean isUsableMessagesUrl(String url) {
		if (!StringUtils.hasText(url)) {
			return false;
		}
		String trimmed = url.trim();
		if (trimmed.contains("${") || trimmed.contains("//messages")) {
			return false;
		}
		return MetaWhatsAppMediaUploader.phoneNumberIdFromMessagesUrl(trimmed) != null;
	}

	private static String firstNonBlank(String... values) {
		if (values == null) {
			return null;
		}
		for (String value : values) {
			if (StringUtils.hasText(value)) {
				return value;
			}
		}
		return null;
	}

}
