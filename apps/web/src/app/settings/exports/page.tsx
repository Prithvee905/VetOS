"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  currentUser,
  getExportDownloadUrl,
  getExportJob,
  listExportJobs,
  requestExport,
  type ExportJob,
} from "@/lib/api";

export default function DataExportsPage() {
  const queryClient = useQueryClient();
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  const session = useQuery({ queryKey: ["session"], queryFn: currentUser, retry: false });

  const exportsQuery = useQuery({
    queryKey: ["export-jobs"],
    queryFn: listExportJobs,
    enabled: session.data?.roles.includes("OWNER") ?? false,
    refetchInterval: pollingId ? 3000 : false,
  });

  const createExport = useMutation({
    mutationFn: () => requestExport("CSV"),
    onSuccess: async (job) => {
      setMessage(`Export ${job.id} queued. Processing…`);
      setPollingId(job.id);
      await queryClient.invalidateQueries({ queryKey: ["export-jobs"] });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : "Failed to request export"),
  });

  useQuery({
    queryKey: ["export-poll", pollingId],
    queryFn: async () => {
      if (!pollingId) return null;
      const job = await getExportJob(pollingId);
      if (job.status === "COMPLETED" || job.status === "FAILED") {
        setPollingId(null);
        setMessage(job.status === "COMPLETED" ? "Export completed. Download below." : "Export failed.");
        await queryClient.invalidateQueries({ queryKey: ["export-jobs"] });
      }
      return job;
    },
    enabled: Boolean(pollingId),
    refetchInterval: 3000,
  });

  if (!session.isLoading && session.data && !session.data.roles.includes("OWNER")) {
    return <p className="text-sm text-rose-600">Owner access required for data exports.</p>;
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Owner data exports</h2>
          <p className="text-sm text-slate-500">Request a tenant-scoped CSV export of clients. Jobs run asynchronously via the outbox worker.</p>
        </div>
        <Button size="sm" onClick={() => createExport.mutate()} disabled={createExport.isPending}>
          Request client CSV export
        </Button>
      </div>

      {message && <p className="text-sm text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-4 py-2">{message}</p>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Format</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(exportsQuery.data ?? []).map((job: ExportJob) => (
              <tr key={job.id}>
                <td className="px-4 py-3">{new Date(job.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">{job.format}</td>
                <td className="px-4 py-3 font-medium">{job.status}</td>
                <td className="px-4 py-3">
                  {job.status === "COMPLETED" ? (
                    <a
                      className="text-teal-700 font-semibold hover:underline"
                      href={getExportDownloadUrl(job.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download CSV
                    </a>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(exportsQuery.data ?? []).length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">No export jobs yet.</p>
        )}
      </div>
    </div>
  );
}
