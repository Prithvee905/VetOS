package com.vetos.integration.messaging;

public final class WhatsAppTemplateNames {

	private WhatsAppTemplateNames() {
	}

	public static String toMetaTemplateName(String logicalTemplate) {
		if (logicalTemplate == null || logicalTemplate.isBlank()) {
			return "campaign_notice";
		}
		String key = logicalTemplate.trim();
		if ("hello_world".equalsIgnoreCase(key)) {
			return "hello_world";
		}
		return switch (key.toUpperCase()) {
			case "INVOICE_PDF" -> "invoice_pdf_alert";
			case "INVOICE_ALERT" -> "invoice_alert";
			case "APPOINTMENT_REMINDER" -> "appointment_reminder";
			case "VAX_REMINDER" -> "vax_due";
			case "DEWORM_REMINDER" -> "deworm_due";
			case "FOLLOWUP_REMINDER" -> "followup_reminder";
			default -> {
				if (key.startsWith("BROADCAST_") || key.startsWith("CAMPAIGN_")) {
					yield "campaign_notice";
				}
				if (key.contains("_") && !key.equals(key.toUpperCase())) {
					yield key.toLowerCase();
				}
				yield "campaign_notice";
			}
		};
	}

}
