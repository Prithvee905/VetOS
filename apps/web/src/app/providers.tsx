"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { checkApiLiveness } from "@/lib/api";

function ApiHealth() {
  const health = useQuery({
    queryKey: ["liveness"],
    queryFn: checkApiLiveness,
    retry: false,
  });

  if (health.isLoading) {
    return <p className="text-sm text-slate-500">Checking API…</p>;
  }
  if (health.isError) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
        <p className="font-medium">API is unreachable — sign-in will not work.</p>
        <p className="mt-1 text-rose-800">
          Restart Docker Desktop, open a terminal in the repo root, and run{" "}
          <code className="rounded bg-white px-1">docker compose up --build</code>. Wait until the API is healthy, then
          refresh this page.
        </p>
      </div>
    );
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
