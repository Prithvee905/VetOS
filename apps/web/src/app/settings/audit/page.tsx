"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { currentUser, listAuditEvents, type AuditEvent } from "@/lib/api";

export default function AuditTrailPage() {
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const session = useQuery({ queryKey: ["session"], queryFn: currentUser, retry: false });

  const auditQuery = useQuery({
    queryKey: ["audit-events", page],
    queryFn: () => listAuditEvents(page, pageSize),
    enabled: session.data?.roles.includes("OWNER") ?? false,
  });

  const totalPages = Math.ceil((auditQuery.data?.total ?? 0) / pageSize);

  if (!session.isLoading && session.data && !session.data.roles.includes("OWNER")) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center max-w-lg mx-auto mt-10">
        <h3 className="text-xl font-bold text-rose-800">403 Forbidden - Access Restricted</h3>
        <p className="text-sm text-rose-600 mt-2">
          The Immutable Compliance Audit Trail is strictly restricted to Clinic Owners. Your current role does not have authorization to view compliance ledgers.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Immutable Clinic Audit Trail</h2>
          <p className="text-sm text-slate-500">
            Append-only compliance ledger recording every mutation, clinical event, and financial transaction.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => auditQuery.refetch()}>
          ↻ Refresh Ledger
        </Button>
      </div>

      <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 text-xs text-teal-800 flex items-center justify-between">
        <span>
          <strong className="text-teal-900">Compliance & Security Notice:</strong> All mutations are cryptographically mapped to user session tokens, tenant clinic boundaries, and distributed request tracing IDs.
        </span>
        <span className="font-bold text-teal-900">Total Audit Records: {auditQuery.data?.total ?? 0}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {auditQuery.isLoading ? (
          <p className="text-sm text-slate-500 p-8 text-center">Loading audit events…</p>
        ) : (auditQuery.data?.items ?? []).length === 0 ? (
          <p className="text-sm text-slate-400 p-8 text-center">No audit records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-400 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Entity Type</th>
                  <th className="px-4 py-3">Entity ID</th>
                  <th className="px-4 py-3">Request ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {auditQuery.data?.items.map((event: AuditEvent) => (
                  <tr key={event.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-sans text-slate-600">
                      {new Date(event.createdAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-sans font-bold text-[11px] text-slate-800">
                        {event.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-sans font-medium text-slate-800">
                      {event.actorName}
                    </td>
                    <td className="px-4 py-3 font-bold text-teal-800">{event.entityType}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {event.entityId ? event.entityId.slice(0, 10) + "…" : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-[10px]">
                      {event.requestId ? event.requestId.slice(0, 8) + "…" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <span>
            Page <strong className="text-slate-800">{page + 1}</strong> of{" "}
            <strong className="text-slate-800">{Math.max(totalPages, 1)}</strong>
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
