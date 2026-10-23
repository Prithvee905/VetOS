package com.vetos.integration.outbox;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vetos.clinical.application.ClinicalWorkflowService;
import com.vetos.clinical.application.ClinicalWorkflowService.ClientResponse;
import com.vetos.clinical.application.ClinicalWorkflowService.InvoiceResponse;
import com.vetos.clinical.application.ClinicalWorkflowService.PatientResponse;
import com.vetos.integration.messaging.InvoicePdfService;
import com.vetos.integration.messaging.MetaWhatsAppMediaUploader;
import com.vetos.integration.messaging.WhatsAppClient;
import com.vetos.integration.messaging.WhatsAppTemplateNames;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class WhatsAppOutboxHandler implements OutboxHandler {

	private final WhatsAppClient whatsAppClient;
	private final ObjectMapper objectMapper;
	private final JdbcTemplate jdbcTemplate;
	private final ClinicalWorkflowService clinicalWorkflowService;
	private final InvoicePdfService invoicePdfService;
	private final MetaWhatsAppMediaUploader mediaUploader;
	private final com.vetos.platform.application.VaccinationCardService vaccinationCardService;
	private final com.vetos.integration.messaging.VaccinationCardPdfService vaccinationCardPdfService;

	public WhatsAppOutboxHandler(
			WhatsAppClient whatsAppClient,
			ObjectMapper objectMapper,
			JdbcTemplate jdbcTemplate,
			ClinicalWorkflowService clinicalWorkflowService,
			InvoicePdfService invoicePdfService,
			MetaWhatsAppMediaUploader mediaUploader,
			com.vetos.platform.application.VaccinationCardService vaccinationCardService,
			com.vetos.integration.messaging.VaccinationCardPdfService vaccinationCardPdfService) {
		this.whatsAppClient = whatsAppClient;
		this.objectMapper = objectMapper;
		this.jdbcTemplate = jdbcTemplate;
		this.clinicalWorkflowService = clinicalWorkflowService;
		this.invoicePdfService = invoicePdfService;
		this.mediaUploader = mediaUploader;
		this.vaccinationCardService = vaccinationCardService;
		this.vaccinationCardPdfService = vaccinationCardPdfService;
	}

	@Override
	public String eventType() {
		return "WHATSAPP_MESSAGE";
	}

	@Override
	public void handle(UUID clinicId, UUID outboxEventId, String payloadJson) throws Exception {
		JsonNode root = objectMapper.readTree(payloadJson);
		boolean sessionMessage = root.path("sessionMessage").asBoolean(false);
		List<String> templateParams = new ArrayList<>();
		if (root.has("templateParams") && root.get("templateParams").isArray()) {
			for (JsonNode node : root.get("templateParams")) {
				templateParams.add(node.asText(""));
			}
		}

		String templateKey = root.path("template").asText("DEFAULT");
		String headerDocumentMediaId = null;
		String headerDocumentFilename = null;

		if (root.hasNonNull("invoiceId") && StringUtils.hasText(root.get("invoiceId").asText())) {
			UUID invoiceId = UUID.fromString(root.get("invoiceId").asText());
			InvoiceResponse invoice = clinicalWorkflowService.getInvoice(clinicId, invoiceId);
			String clientName = "Pet Parent";
			if (invoice.clientId() != null) {
				try {
					ClientResponse client = clinicalWorkflowService.getClient(clinicId, invoice.clientId());
					if (client.displayName() != null && !client.displayName().isBlank()) {
						clientName = client.displayName();
					}
				}
				catch (Exception ignored) {
				}
			}
			String patientName = "";
			if (invoice.patientId() != null) {
				try {
					PatientResponse patient = clinicalWorkflowService.getPatient(clinicId, invoice.patientId());
					patientName = patient.name();
				}
				catch (Exception ignored) {
				}
			}
			if (templateParams.isEmpty()) {
				templateParams.add(clientName);
			}
			if (!sessionMessage) {
				templateKey = "INVOICE_PDF";
				// invoice_pdf_alert body: "Dear {{1}}, Thank you for visiting {{3}} ... invoice {{2}} ..."
				templateParams.clear();
				templateParams.addAll(invoicePdfAlertParams(
						clientName, invoice.invoiceNumber(), clinicalWorkflowService.clinicDisplayName(clinicId)));
				byte[] pdf = invoicePdfService.render(invoice, clientName, patientName,
						clinicalWorkflowService.clinicInvoiceHeader(clinicId));
				headerDocumentFilename = safePdfFilename(invoice.invoiceNumber());
				headerDocumentMediaId = mediaUploader.uploadPdf(pdf, headerDocumentFilename);
				if (!StringUtils.hasText(headerDocumentMediaId)) {
					throw new IllegalStateException("WhatsApp media upload failed for invoice PDF.");
				}
			}
		}
		else if (root.hasNonNull("vaccinationCardPatientId")) {
			// Built now, so every vaccine recorded during the visit is on it.
			var card = vaccinationCardService.load(clinicId, UUID.fromString(root.get("vaccinationCardPatientId").asText()));
			templateKey = "VACCINATION_CARD";
			templateParams.clear();
			// vaccination_card body: owner {{1}}, pet {{2}}, clinic {{3}}
			templateParams.addAll(List.of(
					StringUtils.hasText(card.ownerName()) ? card.ownerName() : "Pet Parent",
					card.petName(),
					StringUtils.hasText(card.clinicName()) ? card.clinicName() : "our clinic"));
			headerDocumentFilename = "Vaccination-card-" + card.petName().replaceAll("[^A-Za-z0-9._-]", "_") + ".pdf";
			headerDocumentMediaId = mediaUploader.uploadPdf(vaccinationCardPdfService.render(card), headerDocumentFilename);
			if (!StringUtils.hasText(headerDocumentMediaId)) {
				throw new IllegalStateException("WhatsApp media upload failed for vaccination card PDF.");
			}
		}
		else if ("INVOICE_PDF".equalsIgnoreCase(templateKey)
				|| "invoice_pdf_alert".equalsIgnoreCase(WhatsAppTemplateNames.toMetaTemplateName(templateKey))) {
			throw new IllegalArgumentException("invoiceId is required for INVOICE_PDF template sends.");
		}

		WhatsAppClient.WhatsAppSendResult result = whatsAppClient.sendTemplateMessage(new WhatsAppClient.WhatsAppMessage(
				root.get("to").asText(),
				templateKey,
				root.path("language").asText("en"),
				root.path("body").asText(""),
				templateParams,
				sessionMessage,
				headerDocumentMediaId,
				headerDocumentFilename));
		if (StringUtils.hasText(result.providerMessageId())) {
			jdbcTemplate.update("""
					update outbox_events
					set provider_message_id = ?, delivery_status = 'SENT'
					where id = ? and clinic_id = ?
					""",
					result.providerMessageId(),
					outboxEventId,
					clinicId);
		}
	}

	/** Values for the Meta template invoice_pdf_alert, in placeholder order: owner, invoice number, clinic. */
	static List<String> invoicePdfAlertParams(String ownerName, String invoiceNumber, String clinicName) {
		return List.of(
				StringUtils.hasText(ownerName) ? ownerName : "Pet Parent",
				StringUtils.hasText(invoiceNumber) ? invoiceNumber : "-",
				StringUtils.hasText(clinicName) ? clinicName : "our clinic");
	}

	private static String safePdfFilename(String invoiceNumber) {
		String base = invoiceNumber == null ? "invoice" : invoiceNumber.replaceAll("[^A-Za-z0-9._-]", "_");
		return base + ".pdf";
	}

}
