package com.vetos.integration.messaging;

public final class WhatsAppTemplateNames {

	private WhatsAppTemplateNames() {
	}

	public static boolean requiresImageHeader(String metaTemplateName) {
		if (metaTemplateName == null) return false;
		return switch (metaTemplateName) {
			case "campaign_notice", "followup_reminder", "deworm_due" -> true;
			default -> false;
		};
	}

	/** Body {{n}} placeholder count of each approved Meta template, or -1 if unknown. Must match Meta exactly. */
	public static int bodyParamCount(String metaTemplateName) {
		if (metaTemplateName == null) return -1;
		return switch (metaTemplateName) {
			case "campaign_notice" -> 3;
			case "followup_reminder", "deworm_due" -> 4;
			default -> -1;
		};
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
			case "INVOICE_ALERT", "CLINIC_UPDATE" -> "campaign_notice";
			case "APPOINTMENT_REMINDER" -> "followup_reminder";
			case "VAX_REMINDER" -> "campaign_notice";
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
