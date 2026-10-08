import { AppShell } from "@/components/app-shell";

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell title="Financial Ledger & Analytics">{children}</AppShell>;
}
