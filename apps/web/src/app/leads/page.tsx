"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createClient,
  createLead,
  listLeads,
  updateLeadStatus,
  type Lead,
} from "@/lib/api";

export default function LeadsCrmPage() {
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("WALK_IN_INQUIRY");
  const [notes, setNotes] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leads = useQuery({
    queryKey: ["leads"],
    queryFn: listLeads,
  });

  const createLeadMutation = useMutation({
    mutationFn: () =>
      createLead({
        displayName,
        phone: phone || undefined,
        email: email || undefined,
        source,
        notes: notes || undefined,
      }),
    onSuccess: async (created) => {
      setMessage(`Lead created: ${created.displayName}`);
      setError(null);
      setDisplayName("");
      setPhone("");
      setEmail("");
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to create lead"),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateLeadStatus(id, status),
    onSuccess: async (_, { status }) => {
      setMessage(`Lead status updated to ${status}`);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to update lead status"),
  });

  const convertToClientMutation = useMutation({
    mutationFn: async (lead: Lead) => {
      // 1. Create client
      await createClient({
        displayName: lead.displayName,
        phone: lead.phone || "9999999999",
        email: lead.email || undefined,
        consentWhatsapp: true,
        consentEmail: true,
      });

      // 2. Mark lead converted
      await updateLeadStatus(lead.id, "CONVERTED");
    },
    onSuccess: async () => {
      setMessage("Lead successfully converted to active Clinic Client!");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to convert lead"),
  });

  return (
    <div className="flex flex-col gap-6 pb-20">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Leads & Inquiries Pipeline</h2>
        <p className="text-sm text-slate-500">
          Track prospect pet owners from website inquiries, phone calls, and walk-ins, and convert them to registered clients.
        </p>
      </div>

      {message && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Lead Intake Form */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">New Lead Intake</h3>

          <div>
            <label className="text-xs font-semibold text-slate-600">Prospect / Pet Owner Name *</label>
            <input
              type="text"
              placeholder="e.g. Alex Morgan"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Phone Number</label>
            <input
              type="text"
              placeholder="e.g. +91 98765 43210"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Email Address</label>
            <input
              type="email"
              placeholder="e.g. alex@example.com"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Acquisition Source</label>
            <select
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="WALK_IN_INQUIRY">Walk-in Inquiry</option>
              <option value="WEBSITE_LEAD">Website / Landing Page</option>
              <option value="PHONE_CALL">Phone Call</option>
              <option value="WHATSAPP_CHAT">WhatsApp Chat</option>
              <option value="REFERRAL">Client Referral</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Inquiry Notes / Questions</label>
            <textarea
              rows={3}
              placeholder="e.g. Interested in puppy vaccination packages and neutering consultation."
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <Button
            className="mt-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold"
            onClick={() => createLeadMutation.mutate()}
            disabled={!displayName || createLeadMutation.isPending}
          >
            {createLeadMutation.isPending ? "Creating…" : "Save Prospect Lead →"}
          </Button>
        </div>

        {/* Right: Leads Pipeline Table */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Leads Pipeline ({leads.data?.length ?? 0})</h3>
              <p className="text-xs text-slate-500">Manage lead states and convert prospects into clients</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => leads.refetch()}>
              ↻ Refresh
            </Button>
          </div>

          {leads.isLoading ? (
            <p className="text-sm text-slate-500 py-8">Loading leads…</p>
          ) : (leads.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No leads recorded yet. Add your first lead on the left.</p>
          ) : (
            <div className="divide-y divide-slate-100 mt-2">
              {leads.data?.map((lead) => {
                const isConverted = lead.status === "CONVERTED";
                const isLost = lead.status === "LOST";

                return (
                  <div key={lead.id} className="py-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{lead.displayName}</p>
                      <p className="text-xs text-slate-500">Lead ID: {lead.id.slice(0, 8)}…</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <select
                        className={`rounded-full px-3 py-1 text-xs font-bold border ${
                          isConverted
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : isLost
                            ? "bg-rose-100 text-rose-800 border-rose-300"
                            : "bg-sky-100 text-sky-800 border-sky-300"
                        }`}
                        value={lead.status}
                        onChange={(e) => updateStatusMutation.mutate({ id: lead.id, status: e.target.value })}
                        disabled={isConverted}
                      >
                        <option value="NEW">NEW</option>
                        <option value="CONTACTED">CONTACTED</option>
                        <option value="QUALIFIED">QUALIFIED</option>
                        <option value="CONVERTED">CONVERTED</option>
                        <option value="LOST">LOST</option>
                      </select>

                      {!isConverted && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                          onClick={() => convertToClientMutation.mutate(lead)}
                          disabled={convertToClientMutation.isPending}
                        >
                          Convert to Client ✓
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
