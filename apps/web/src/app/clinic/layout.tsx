import { AppShell } from "@/components/app-shell";

export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="VetOS clinic">{children}</AppShell>;
}
