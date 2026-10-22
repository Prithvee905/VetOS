package com.vetos.integration.messaging;

import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.BaseFont;
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

	private static final Font TITLE = font(BaseFont.HELVETICA_BOLD, 16);
	private static final Font NORMAL = font(BaseFont.HELVETICA, 10);
	private static final Font SMALL = font(BaseFont.HELVETICA, 9);
	private static final Font HEADER = font(BaseFont.HELVETICA_BOLD, 9);

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
			// The built-in PDF font cannot draw the rupee sign, so amounts are labelled with the currency code.
			String code = invoice.currencyCode() == null || invoice.currencyCode().isBlank() ? "INR" : invoice.currencyCode();
			document.add(new Paragraph("Amounts in " + code, SMALL));
			document.add(new Paragraph(" "));

			PdfPTable table = new PdfPTable(4);
			table.setWidthPercentage(100);
			table.setWidths(new float[] { 4f, 1f, 1.5f, 1.5f });
			addHeaderCell(table, "Description");
			addHeaderCell(table, "Qty");
			addHeaderCell(table, "Unit (" + code + ")");
			addHeaderCell(table, "Total (" + code + ")");
			if (invoice.lines() == null || invoice.lines().isEmpty()) {
				document.add(new Paragraph("No line items recorded on this invoice.", NORMAL));
			}
			else {
				for (InvoiceLineResponse line : invoice.lines()) {
					table.addCell(cell(line.description()));
					table.addCell(cell(formatQty(line.quantity())));
					table.addCell(cell(money(line.unitPrice())));
					table.addCell(cell(money(line.lineTotal())));
				}
				document.add(table);
			}
			document.add(new Paragraph(" "));
			document.add(new Paragraph("Subtotal: " + code + " " + money(invoice.subtotal()), NORMAL));
			document.add(new Paragraph("Tax: " + code + " " + money(invoice.taxTotal()), NORMAL));
			document.add(new Paragraph("Total: " + code + " " + money(invoice.total()), TITLE));
			document.add(new Paragraph("Paid: " + code + " " + money(invoice.amountPaid()), NORMAL));
			document.add(new Paragraph(" "));
			document.add(new Paragraph("Thank you for visiting us.", SMALL));

			document.close();
			byte[] bytes = output.toByteArray();
			if (bytes.length < 200) {
				throw new IllegalStateException("Generated invoice PDF was unexpectedly small.");
			}
			return bytes;
		}
		catch (Exception exception) {
			throw new IllegalStateException("Failed to generate invoice PDF.", exception);
		}
	}

	private static Font font(String face, float size) {
		try {
			BaseFont base = BaseFont.createFont(face, BaseFont.WINANSI, BaseFont.EMBEDDED);
			return new Font(base, size);
		}
		catch (Exception exception) {
			return FontFactory.getFont(face, size);
		}
	}

	private static void addHeaderCell(PdfPTable table, String text) {
		PdfPCell cell = new PdfPCell(new Phrase(text, HEADER));
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
