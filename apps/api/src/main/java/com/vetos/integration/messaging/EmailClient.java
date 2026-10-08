package com.vetos.integration.messaging;

public interface EmailClient {

	void send(EmailMessage message);

	record EmailMessage(String to, String subject, String textBody) {
	}

}
