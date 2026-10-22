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
