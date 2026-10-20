package com.vetos.integration.messaging;

public interface WhatsAppClient {

	WhatsAppSendResult sendTemplateMessage(WhatsAppMessage message);

	record WhatsAppMessage(
			String toPhoneE164,
			String templateName,
			String languageCode,
			String bodyPreview,
			java.util.List<String> templateParams,
			boolean sessionMessage,
			String headerDocumentMediaId,
			String headerDocumentFilename,
			String headerImageLink) {

		public WhatsAppMessage(String toPhoneE164, String templateName, String languageCode, String bodyPreview) {
			this(toPhoneE164, templateName, languageCode, bodyPreview, java.util.List.of(), false, null, null, null);
		}

		public WhatsAppMessage(
				String toPhoneE164,
				String templateName,
				String languageCode,
				String bodyPreview,
				java.util.List<String> templateParams,
				boolean sessionMessage) {
			this(toPhoneE164, templateName, languageCode, bodyPreview, templateParams, sessionMessage, null, null, null);
		}

		public WhatsAppMessage(
				String toPhoneE164,
				String templateName,
				String languageCode,
				String bodyPreview,
				java.util.List<String> templateParams,
				boolean sessionMessage,
				String headerDocumentMediaId,
				String headerDocumentFilename) {
			this(toPhoneE164, templateName, languageCode, bodyPreview, templateParams, sessionMessage, headerDocumentMediaId, headerDocumentFilename, null);
		}
	}

	record WhatsAppSendResult(String providerMessageId) {
	}

}
