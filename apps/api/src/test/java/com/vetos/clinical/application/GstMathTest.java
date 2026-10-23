package com.vetos.clinical.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class GstMathTest {

	@Test
	void inclusivePriceKeepsWhatTheClientPaysAndWorksGstOutOfIt() {
		// MRP 1500 at 12% GST: taxable 1339.29, GST 160.71, client still pays 1500.
		GstMath.LineTax tax = GstMath.compute(new BigDecimal("1500"), new BigDecimal("0.12"), true);
		assertThat(tax.taxable()).isEqualByComparingTo("1339.29");
		assertThat(tax.tax()).isEqualByComparingTo("160.71");
		assertThat(tax.total()).isEqualByComparingTo("1500.00");
	}

	@Test
	void exclusivePriceAddsGstOnTop() {
		GstMath.LineTax tax = GstMath.compute(new BigDecimal("1000"), new BigDecimal("0.18"), false);
		assertThat(tax.taxable()).isEqualByComparingTo("1000.00");
		assertThat(tax.tax()).isEqualByComparingTo("180.00");
		assertThat(tax.total()).isEqualByComparingTo("1180.00");
	}

	@Test
	void exemptItemsCarryNoTax() {
		GstMath.LineTax tax = GstMath.compute(new BigDecimal("500"), BigDecimal.ZERO, true);
		assertThat(tax.tax()).isEqualByComparingTo("0");
		assertThat(tax.total()).isEqualByComparingTo("500");
	}

	@Test
	void cgstAndSgstAlwaysAddUpToTheTax() {
		BigDecimal[] split = GstMath.splitIntraState(new BigDecimal("160.71"));
		assertThat(split[0]).isEqualByComparingTo("80.36");
		assertThat(split[1]).isEqualByComparingTo("80.35");
		assertThat(split[0].add(split[1])).isEqualByComparingTo("160.71");
	}

}
