import type { Product, ServiceItem } from "@/lib/api";

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const isActive = (status?: string) => !status || status.toUpperCase() === "ACTIVE";

/** The clinic's consultation service from the catalog (code or name containing "consult"). */
export function findConsultationService(services: ServiceItem[] | undefined): ServiceItem | undefined {
  const active = (services ?? []).filter((s) => isActive(s.status));
  return (
    active.find((s) => normalize(s.code).startsWith("consult")) ??
    active.find((s) => normalize(s.name).includes("consult"))
  );
}

/** A catalog service whose name mentions the given keyword (e.g. a vaccine name), if any. */
export function findServiceByKeyword(services: ServiceItem[] | undefined, keyword: string): ServiceItem | undefined {
  const key = normalize(keyword).split(/[\s(/]+/)[0];
  if (!key) return undefined;
  return (services ?? []).filter((s) => isActive(s.status)).find((s) => normalize(s.name).includes(key));
}

/** Inventory product for a prescribed medicine: by id first, then by exact name. */
export function findProductForMedicine(
  products: Product[] | undefined,
  medicineName: string,
  productId?: string
): Product | undefined {
  const list = (products ?? []).filter((p) => isActive(p.status));
  if (productId) {
    const byId = list.find((p) => p.id === productId);
    if (byId) return byId;
  }
  const name = normalize(medicineName);
  return name ? list.find((p) => normalize(p.name) === name) : undefined;
}

/**
 * GST fields for a basket line from a catalog service or inventory product.
 * The catalog stores a percentage (12); invoices store a fraction (0.12).
 */
export function gstOf(item: { gstRate?: number | null; hsnSac?: string | null; hsnCode?: string | null } | undefined): {
  taxRate: number;
  hsnSac?: string;
} {
  const rate = Number(item?.gstRate ?? 0);
  const code = item?.hsnSac ?? item?.hsnCode ?? undefined;
  return { taxRate: rate > 0 ? rate / 100 : 0, ...(code ? { hsnSac: code } : {}) };
}

/**
 * Taxable value and GST for a line after discount, matching the server's GstMath:
 * inclusive prices contain the GST, exclusive prices have it added on top.
 */
export function lineGst(netAmount: number, taxRate: number, pricesIncludeTax: boolean): { taxable: number; tax: number; total: number } {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (!(taxRate > 0)) return { taxable: round(netAmount), tax: 0, total: round(netAmount) };
  if (pricesIncludeTax) {
    const taxable = round(netAmount / (1 + taxRate));
    return { taxable, tax: round(netAmount - taxable), total: round(netAmount) };
  }
  const tax = round(netAmount * taxRate);
  return { taxable: round(netAmount), tax, total: round(netAmount + tax) };
}
