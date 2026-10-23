package com.vetos.integration.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import com.vetos.platform.application.VaccinationCardService.Card;
import com.vetos.platform.application.VaccinationCardService.Dose;
import com.vetos.platform.application.VaccinationCardService.Due;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

class VaccinationCardPdfServiceTest {

	@Test
	void cardListsGivenAndDueVaccines() throws Exception {
		Card card = new Card("Paws Clinic", "Road 1, Hyderabad", "9000000000", "Gowri", "9876543210", "Bruno", "CANINE", "Indie",
				LocalDate.of(2026, 8, 1), null,
				List.of(new Dose("DHPPi", LocalDate.of(2026, 9, 12), LocalDate.of(2026, 10, 3), "B-77")),
				List.of(new Due("DHPPi", "Dose 2 of 3", LocalDate.of(2026, 10, 3))));

		byte[] pdf = new VaccinationCardPdfService().render(card);

		try (PdfReader reader = new PdfReader(pdf)) {
			String text = new PdfTextExtractor(reader).getTextFromPage(1);
			assertThat(text).contains("Paws Clinic").contains("Bruno").contains("Dose 2 of 3").contains("B-77").contains("03 Oct 2026");
		}
	}
}
