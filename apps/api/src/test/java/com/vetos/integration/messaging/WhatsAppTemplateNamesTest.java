package com.vetos.integration.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class WhatsAppTemplateNamesTest {

	@Test
	void mapsLogicalReminderTemplates() {
		assertThat(WhatsAppTemplateNames.toMetaTemplateName("APPOINTMENT_REMINDER")).isEqualTo("appointment_reminder");
		assertThat(WhatsAppTemplateNames.toMetaTemplateName("VAX_REMINDER")).isEqualTo("vax_due");
		assertThat(WhatsAppTemplateNames.toMetaTemplateName("BROADCAST_ALL")).isEqualTo("campaign_notice");
	}

}
