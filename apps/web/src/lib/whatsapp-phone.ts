/** Normalize Indian mobile numbers for Meta WhatsApp (E.164 without +). */
export function formatIndianWhatsAppPhone(raw: string): string | null {
  const clean = raw.replace(/\D/g, "");
  if (clean.length < 10) {
    return null;
  }
  if (clean.length === 10) {
    return `91${clean}`;
  }
  return clean;
}

export function resolveInvoiceWhatsAppPhone(customPhone: string, clientPhone?: string | null): string | null {
  const raw = customPhone.trim() || (clientPhone?.trim() ?? "");
  return formatIndianWhatsAppPhone(raw);
}

/** Last 10 digits for POS input (owner profile may include country code). */
export function phoneDigitsForInput(raw?: string | null): string {
  if (!raw?.trim()) {
    return "";
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}
