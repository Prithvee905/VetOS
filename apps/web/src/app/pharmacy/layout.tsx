import { AppShell } from "@/components/app-shell";

export default function PharmacyLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="Pharmacy & Dispensing Station">{children}</AppShell>;
}
