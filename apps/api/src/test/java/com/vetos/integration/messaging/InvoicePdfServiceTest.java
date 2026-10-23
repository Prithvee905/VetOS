package com.vetos.integration.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import com.lowagie.text.pdf.PdfReader;
import com.vetos.clinical.application.ClinicalWorkflowService.InvoiceLineResponse;
import com.vetos.clinical.application.ClinicalWorkflowService.InvoiceResponse;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class InvoicePdfServiceTest {

	private final InvoicePdfService service = new InvoicePdfService();

	@Test
	void renderProducesReadablePdfWithLineItems() throws Exception {
		UUID invoiceId = UUID.randomUUID();
		InvoiceResponse invoice = new InvoiceResponse(
				invoiceId,
				UUID.randomUUID(),
				UUID.randomUUID(),
				UUID.randomUUID(),
				"INV-TEST-001",
				"PAID",
				"INR",
				new BigDecimal("100.00"),
				BigDecimal.ZERO,
				new BigDecimal("18.00"),
				new BigDecimal("118.00"),
				new BigDecimal("118.00"),
				Instant.parse("2026-03-20T10:00:00Z"),
				1L,
				List.of(new InvoiceLineResponse(
						UUID.randomUUID(),
						"SERVICE",
						UUID.randomUUID(),
						"Consultation",
						new BigDecimal("1"),
						new BigDecimal("100.00"),
						BigDecimal.ZERO,
						new BigDecimal("0.18"),
						new BigDecimal("18.00"),
						new BigDecimal("118.00"),
						"998311")));

		byte[] pdf = service.render(invoice, "Ravi Kumar", "Bruno", "PawCare Hospital");

		assertThat(pdf).isNotNull();
		assertThat(pdf.length).isGreaterThan(500);

		try (PdfReader reader = new PdfReader(pdf)) {
			assertThat(reader.getNumberOfPages()).isGreaterThanOrEqualTo(1);
		}
	}

}
