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
