package com.vetos.integration.messaging;

import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import com.vetos.clinical.application.ClinicalWorkflowService.InvoiceLineResponse;
import com.vetos.clinical.application.ClinicalWorkflowService.InvoiceResponse;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import org.springframework.stereotype.Service;

@Service
public class InvoicePdfService {

	private static final Font TITLE = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 16);
	private static final Font NORMAL = FontFactory.getFont(FontFactory.HELVETICA, 10);
	private static final Font SMALL = FontFactory.getFont(FontFactory.HELVETICA, 9);

	public byte[] render(InvoiceResponse invoice, String clientName, String patientName, String clinicLabel) {
		try {
			Document document = new Document();
			ByteArrayOutputStream output = new ByteArrayOutputStream();
			PdfWriter.getInstance(document, output);
			document.open();

			String clinic = clinicLabel == null || clinicLabel.isBlank() ? "VetOS Clinic" : clinicLabel;
			document.add(new Paragraph(clinic, TITLE));
			document.add(new Paragraph("Invoice " + invoice.invoiceNumber(), NORMAL));
			if (invoice.issuedAt() != null) {
				String when = DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm")
						.withZone(ZoneId.of("Asia/Kolkata"))
						.format(invoice.issuedAt());
				document.add(new Paragraph("Date: " + when, SMALL));
			}
			document.add(new Paragraph(" "));
			document.add(new Paragraph("Bill to: " + (clientName == null || clientName.isBlank() ? "Pet Parent" : clientName), NORMAL));
			if (patientName != null && !patientName.isBlank()) {
				document.add(new Paragraph("Patient: " + patientName, NORMAL));
			}
			document.add(new Paragraph("Status: " + invoice.status(), NORMAL));
			document.add(new Paragraph(" "));

			PdfPTable table = new PdfPTable(4);
			table.setWidthPercentage(100);
			table.setWidths(new float[] { 4f, 1f, 1.5f, 1.5f });
			addHeaderCell(table, "Description");
			addHeaderCell(table, "Qty");
			addHeaderCell(table, "Unit");
			addHeaderCell(table, "Total");
			for (InvoiceLineResponse line : invoice.lines()) {
				table.addCell(cell(line.description()));
				table.addCell(cell(formatQty(line.quantity())));
				table.addCell(cell(money(line.unitPrice())));
				table.addCell(cell(money(line.lineTotal())));
			}
			document.add(table);
			document.add(new Paragraph(" "));
			document.add(new Paragraph("Subtotal: " + money(invoice.subtotal()), NORMAL));
			document.add(new Paragraph("Tax: " + money(invoice.taxTotal()), NORMAL));
			document.add(new Paragraph("Total: " + money(invoice.total()), TITLE));
			document.add(new Paragraph("Paid: " + money(invoice.amountPaid()), NORMAL));
			document.add(new Paragraph(" "));
			document.add(new Paragraph("Thank you for visiting us.", SMALL));

			document.close();
			return output.toByteArray();
		}
		catch (Exception exception) {
			throw new IllegalStateException("Failed to generate invoice PDF.", exception);
		}
	}

	private static void addHeaderCell(PdfPTable table, String text) {
		PdfPCell cell = new PdfPCell(new Phrase(text, FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9)));
		cell.setHorizontalAlignment(Element.ALIGN_CENTER);
		table.addCell(cell);
	}

	private static PdfPCell cell(String text) {
		return new PdfPCell(new Phrase(text == null ? "" : text, SMALL));
	}

	private static String money(BigDecimal amount) {
		if (amount == null) {
			return "0.00";
		}
		return amount.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
	}

	private static String formatQty(BigDecimal quantity) {
		if (quantity == null) {
			return "0";
		}
		return quantity.stripTrailingZeros().toPlainString();
	}

}
