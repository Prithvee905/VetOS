import { AppShell } from "@/components/app-shell";

export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="Procurement & Vendor Management">{children}</AppShell>;
}
