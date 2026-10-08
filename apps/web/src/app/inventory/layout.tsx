import { AppShell } from "@/components/app-shell";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="Inventory & Stock Management">{children}</AppShell>;
}
