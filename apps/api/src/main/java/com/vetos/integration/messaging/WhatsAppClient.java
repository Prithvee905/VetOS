package com.vetos.integration.messaging;

public interface WhatsAppClient {

	void sendTemplateMessage(WhatsAppMessage message);

	record WhatsAppMessage(String toPhoneE164, String templateName, String languageCode, String bodyPreview) {
	}

}
