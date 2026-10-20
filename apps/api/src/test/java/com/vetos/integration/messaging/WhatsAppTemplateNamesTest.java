package com.vetos.integration.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class WhatsAppTemplateNamesTest {

	@Test
	void mapsLogicalReminderTemplates() {
		assertThat(WhatsAppTemplateNames.toMetaTemplateName("APPOINTMENT_REMINDER")).isEqualTo("followup_reminder");
		assertThat(WhatsAppTemplateNames.toMetaTemplateName("VAX_REMINDER")).isEqualTo("campaign_notice");
		assertThat(WhatsAppTemplateNames.toMetaTemplateName("DEWORM_REMINDER")).isEqualTo("deworm_due");
		assertThat(WhatsAppTemplateNames.toMetaTemplateName("FOLLOWUP_REMINDER")).isEqualTo("followup_reminder");
		assertThat(WhatsAppTemplateNames.toMetaTemplateName("BROADCAST_ALL")).isEqualTo("campaign_notice");
		assertThat(WhatsAppTemplateNames.toMetaTemplateName("INVOICE_PDF")).isEqualTo("invoice_pdf_alert");
		assertThat(WhatsAppTemplateNames.toMetaTemplateName("INVOICE_ALERT")).isEqualTo("campaign_notice");
	}

}
