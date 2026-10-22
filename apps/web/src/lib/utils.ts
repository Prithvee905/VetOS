import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats an amount in the clinic currency (INR by default), e.g. ₹3,400.00. */
export function formatMoney(amount: number | string | null | undefined, currency = "INR"): string {
  const value = Number(amount);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number.isFinite(value) ? value : 0);
}
