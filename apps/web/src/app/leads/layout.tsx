import { AppShell } from "@/components/app-shell";

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="Client & Lead Acquisition CRM">{children}</AppShell>;
}
