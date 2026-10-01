"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState } from "react";

function ApiHealth() {
  const health = useQuery({
    queryKey: ["liveness"],
    queryFn: async () => {
      const response = await fetch("/actuator/health/liveness", { credentials: "include" });
      if (!response.ok) {
        throw new Error("API is not ready");
      }
      return response.json() as Promise<{ status: string }>;
    },
  });

  if (health.isLoading) {
    return <p className="text-sm text-slate-500">Checking API…</p>;
  }
  if (health.isError) {
    return <p className="text-sm text-rose-700">API is unreachable.</p>;
  }
  return <p className="text-sm text-teal-800">API {health.data?.status ?? "unknown"}</p>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      {children}
      <div className="mx-auto max-w-lg px-6 pb-10">
        <ApiHealth />
      </div>
    </QueryClientProvider>
  );
}
