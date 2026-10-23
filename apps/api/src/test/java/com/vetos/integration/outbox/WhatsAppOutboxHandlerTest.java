package com.vetos.integration.outbox;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class WhatsAppOutboxHandlerTest {

	@Test
	void invoiceTemplateValuesFollowMetaPlaceholderOrder() {
		// Meta body: "Dear {{1}}, Thank you for visiting {{3}} ... invoice {{2}} has been generated"
		assertThat(WhatsAppOutboxHandler.invoicePdfAlertParams("Dharani", "INV-000006", "VetOS clinic"))
				.containsExactly("Dharani", "INV-000006", "VetOS clinic");
		assertThat(WhatsAppOutboxHandler.invoicePdfAlertParams(null, "INV-1", " "))
				.containsExactly("Pet Parent", "INV-1", "our clinic");
	}

}
