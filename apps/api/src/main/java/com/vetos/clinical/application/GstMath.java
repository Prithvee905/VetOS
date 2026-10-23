package com.vetos.clinical.application;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** GST arithmetic for one invoice line, in rupees rounded to paise. */
public final class GstMath {

	private static final BigDecimal TWO = BigDecimal.valueOf(2);

	private GstMath() {
	}

	/** Taxable value, GST and what the client pays for the line. */
	public record LineTax(BigDecimal taxable, BigDecimal tax, BigDecimal total) {
	}

	/**
	 * @param gross            quantity × unit price − discount
	 * @param rate             GST as a fraction (0.12 for 12%)
	 * @param pricesIncludeTax true when the price already contains GST (MRP), so GST is worked out of it
	 */
	public static LineTax compute(BigDecimal gross, BigDecimal rate, boolean pricesIncludeTax) {
		BigDecimal amount = (gross == null || gross.signum() < 0 ? BigDecimal.ZERO : gross).setScale(2, RoundingMode.HALF_UP);
		if (rate == null || rate.signum() <= 0) {
			return new LineTax(amount, BigDecimal.ZERO.setScale(2), amount);
		}
		if (pricesIncludeTax) {
			BigDecimal taxable = amount.divide(BigDecimal.ONE.add(rate), 2, RoundingMode.HALF_UP);
			return new LineTax(taxable, amount.subtract(taxable), amount);
		}
		BigDecimal tax = amount.multiply(rate).setScale(2, RoundingMode.HALF_UP);
		return new LineTax(amount, tax, amount.add(tax));
	}

	/** CGST and SGST for a sale within the clinic's state; the two always add up to the tax. */
	public static BigDecimal[] splitIntraState(BigDecimal tax) {
		BigDecimal total = tax == null ? BigDecimal.ZERO : tax.setScale(2, RoundingMode.HALF_UP);
		BigDecimal cgst = total.divide(TWO, 2, RoundingMode.HALF_UP);
		return new BigDecimal[] { cgst, total.subtract(cgst) };
	}

}
