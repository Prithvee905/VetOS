"use client";

import { useQuery } from "@tanstack/react-query";
import { currentUser, getProductionGates } from "@/lib/api";

export default function ProductionGatesPage() {
  const session = useQuery({ queryKey: ["session"], queryFn: currentUser, retry: false });
  const gates = useQuery({
    queryKey: ["production-gates"],
    queryFn: getProductionGates,
    enabled: session.data?.roles.includes("OWNER") ?? false,
  });

  if (!session.isLoading && session.data && !session.data.roles.includes("OWNER")) {
    return <p className="text-sm text-rose-600">Owner access required.</p>;
  }

  return (
    <div className="space-y-4 pb-16">
      <h2 className="text-xl font-bold text-slate-900">Production readiness gates</h2>
      <p className="text-sm text-slate-500">Automated checks plus manual items still required for phases 17–18.</p>
      <pre className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs overflow-auto">
        {JSON.stringify(gates.data ?? {}, null, 2)}
      </pre>
    </div>
  );
}
