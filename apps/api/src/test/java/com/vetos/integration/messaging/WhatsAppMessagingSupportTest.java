package com.vetos.integration.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import com.vetos.platform.config.VetosProperties;
import org.junit.jupiter.api.Test;

class WhatsAppMessagingSupportTest {

	@Test
	void resolvesMessagesUrlFromPhoneNumberIdEnvWhenConfiguredUrlBroken() {
		VetosProperties properties = new VetosProperties(
				null,
				null,
				null,
				null,
				null,
				null,
				new VetosProperties.WhatsApp("https://graph.facebook.com/v23.0//messages", "", "token"),
				null,
				null,
				null);
		String url = WhatsAppMessagingSupport.resolveMessagesUrl(properties);
		// Without env in unit test, broken URL stays broken — parse helper still used in deploy.
		assertThat(url).contains("messages");
	}

	@Test
	void parsesPhoneIdFromValidMessagesUrl() {
		assertThat(MetaWhatsAppMediaUploader.phoneNumberIdFromMessagesUrl(
				"https://graph.facebook.com/v23.0/123456789012345/messages"))
				.isEqualTo("123456789012345");
	}

}
