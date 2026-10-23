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
import com.vetos.platform.application.VaccinationCardService.Card;
import com.vetos.platform.application.VaccinationCardService.Dose;
import com.vetos.platform.application.VaccinationCardService.Due;
import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.springframework.stereotype.Service;

/** The pet's vaccination card as a PDF, sent on WhatsApp and printable from the patient record. */
@Service
public class VaccinationCardPdfService {

	private static final Font TITLE = font(BaseFont.HELVETICA_BOLD, 16);
	private static final Font SUBTITLE = font(BaseFont.HELVETICA_BOLD, 11);
	private static final Font NORMAL = font(BaseFont.HELVETICA, 10);
	private static final Font SMALL = font(BaseFont.HELVETICA, 9);
	private static final Font HEADER = font(BaseFont.HELVETICA_BOLD, 9);
	private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH);

	public byte[] render(Card card) {
		try {
			Document document = new Document();
			ByteArrayOutputStream output = new ByteArrayOutputStream();
			PdfWriter.getInstance(document, output);
			document.open();

			document.add(new Paragraph(blank(card.clinicName()) ? "Vaccination Card" : card.clinicName(), TITLE));
			if (!blank(card.clinicAddress())) {
				document.add(new Paragraph(card.clinicAddress(), SMALL));
			}
			if (!blank(card.clinicPhone())) {
				document.add(new Paragraph("Tel: " + card.clinicPhone(), SMALL));
			}
			document.add(new Paragraph(" "));
			document.add(new Paragraph("Vaccination Card", SUBTITLE));
			document.add(new Paragraph("Pet: " + card.petName() + species(card), NORMAL));
			if (card.dateOfBirth() != null) {
				document.add(new Paragraph("Date of birth: " + DATE.format(card.dateOfBirth()), NORMAL));
			}
			if (!blank(card.microchip())) {
				document.add(new Paragraph("Microchip: " + card.microchip(), NORMAL));
			}
			document.add(new Paragraph("Owner: " + (blank(card.ownerName()) ? "-" : card.ownerName()), NORMAL));
			document.add(new Paragraph(" "));

			if (!card.due().isEmpty()) {
				document.add(new Paragraph("Due next", SUBTITLE));
				PdfPTable next = table(new float[] { 3f, 2f, 1.6f }, "Vaccine", "Dose", "Due on");
				for (Due due : card.due()) {
					next.addCell(cell(due.vaccineName()));
					next.addCell(cell(due.doseLabel()));
					next.addCell(cell(date(due.dueOn())));
				}
				document.add(next);
				document.add(new Paragraph(" "));
			}

			document.add(new Paragraph("Vaccinations given", SUBTITLE));
			if (card.doses().isEmpty()) {
				document.add(new Paragraph("No vaccinations recorded yet.", NORMAL));
			}
			else {
				PdfPTable given = table(new float[] { 3f, 1.6f, 1.6f, 1.6f }, "Vaccine", "Given on", "Batch", "Next due");
				for (Dose dose : card.doses()) {
					given.addCell(cell(dose.vaccineName()));
					given.addCell(cell(date(dose.administeredOn())));
					given.addCell(cell(dose.batchNumber()));
					given.addCell(cell(date(dose.nextDueOn())));
				}
				document.add(given);
			}
			document.add(new Paragraph(" "));
			document.add(new Paragraph("Generated " + DATE.format(LocalDate.now()) + ". Please bring this card to every visit.", SMALL));

			document.close();
			return output.toByteArray();
		}
		catch (Exception exception) {
			throw new IllegalStateException("Failed to generate vaccination card PDF.", exception);
		}
	}

	private static String species(Card card) {
		String species = switch (card.speciesCode() == null ? "" : card.speciesCode().toUpperCase(Locale.ROOT)) {
			case "CANINE" -> "Dog";
			case "FELINE" -> "Cat";
			case "AVIAN" -> "Bird";
			default -> "";
		};
		String breed = blank(card.breed()) ? "" : card.breed();
		String detail = (species + (species.isEmpty() || breed.isEmpty() ? "" : ", ") + breed).trim();
		return detail.isEmpty() ? "" : " (" + detail + ")";
	}

	private static PdfPTable table(float[] widths, String... headers) throws Exception {
		PdfPTable table = new PdfPTable(widths.length);
		table.setWidthPercentage(100);
		table.setWidths(widths);
		for (String header : headers) {
			PdfPCell cell = new PdfPCell(new Phrase(header, HEADER));
			cell.setHorizontalAlignment(Element.ALIGN_CENTER);
			table.addCell(cell);
		}
		return table;
	}

	private static PdfPCell cell(String text) {
		return new PdfPCell(new Phrase(text == null ? "" : text, SMALL));
	}

	private static String date(LocalDate date) {
		return date == null ? "" : DATE.format(date);
	}

	private static boolean blank(String value) {
		return value == null || value.isBlank();
	}

	private static Font font(String face, float size) {
		try {
			return new Font(BaseFont.createFont(face, BaseFont.WINANSI, BaseFont.EMBEDDED), size);
		}
		catch (Exception exception) {
			return FontFactory.getFont(face, size);
		}
	}
}
