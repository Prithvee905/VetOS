import { AppShell } from "@/components/app-shell";

export default function PatientsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="Pet Patients & Medical History">{children}</AppShell>;
}
