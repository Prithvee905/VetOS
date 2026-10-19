package com.vetos.integration.messaging;

public interface WhatsAppClient {

	WhatsAppSendResult sendTemplateMessage(WhatsAppMessage message);

	record WhatsAppMessage(
			String toPhoneE164,
			String templateName,
			String languageCode,
			String bodyPreview,
			java.util.List<String> templateParams,
			boolean sessionMessage) {

		public WhatsAppMessage(String toPhoneE164, String templateName, String languageCode, String bodyPreview) {
			this(toPhoneE164, templateName, languageCode, bodyPreview, java.util.List.of(), false);
		}
	}

	record WhatsAppSendResult(String providerMessageId) {
	}

}
