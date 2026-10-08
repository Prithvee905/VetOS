"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  listOutboxEvents,
  sendEmail,
  sendWhatsApp,
  triggerReminders,
  type OutboxEvent,
  type ReminderRunSummary,
} from "@/lib/api";

export default function CommunicationsHubPage() {
  const queryClient = useQueryClient();

  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [waPhone, setWaPhone] = useState("");
  const [waTemplate, setWaTemplate] = useState("CLINIC_UPDATE");
  const [waBody, setWaBody] = useState("Hello! This is a message from your veterinary clinic regarding your upcoming visit.");

  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("Veterinary Care Follow-up - VetOS Clinic");
  const [emailBody, setEmailBody] = useState("Dear Pet Parent,\n\nThank you for choosing our clinic. Please find attached the care notes and updates.\n\nWarm regards,\nVetOS Team");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll outbox every 4 seconds
  const outbox = useQuery({
    queryKey: ["outbox-events"],
    queryFn: () => listOutboxEvents(50),
    refetchInterval: 4_000,
  });

  const sendWhatsAppMutation = useMutation({
    mutationFn: () => sendWhatsApp({ to: waPhone, template: waTemplate, body: waBody }),
    onSuccess: async () => {
      setMessage(`WhatsApp message dispatched to ${waPhone} and queued to outbox.`);
      setError(null);
      setWaPhone("");
      await queryClient.invalidateQueries({ queryKey: ["outbox-events"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to queue WhatsApp message"),
  });

  const sendEmailMutation = useMutation({
    mutationFn: () => sendEmail({ to: emailTo, subject: emailSubject, body: emailBody }),
    onSuccess: async () => {
      setMessage(`Email queued to ${emailTo} in outbox.`);
      setError(null);
      setEmailTo("");
      await queryClient.invalidateQueries({ queryKey: ["outbox-events"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to queue email"),
  });

  const triggerRemindersMutation = useMutation({
    mutationFn: triggerReminders,
    onSuccess: async (summary: ReminderRunSummary) => {
      setMessage(
        `PRM Reminder Scan Completed: ${summary.appointmentsReminded} appointments, ${summary.vaccinationsReminded} vaccinations, and ${summary.dewormingsReminded} dewormings queued to outbox.`,
      );
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["outbox-events"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to trigger reminders"),
  });

  return (
    <div className="flex flex-col gap-6 pb-20">
      {/* Header & Status */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Patient Relationship Management & Outbox Hub</h2>
          <p className="text-sm text-slate-500">
            Dispatch automated reminders, WhatsApp notifications, emails, and monitor outbox delivery events.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="bg-teal-700 hover:bg-teal-800 text-white font-semibold flex items-center gap-1.5 shadow-sm"
            onClick={() => triggerRemindersMutation.mutate()}
            disabled={triggerRemindersMutation.isPending}
          >
            <span>⚡ Run Automated PRM Reminders</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["outbox-events"] })}
          >
            ↻ Refresh Outbox
          </Button>
        </div>
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

      {/* Grid: Dispatch Composer & PRM Engine Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Message Composer */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Direct Message Dispatch</h3>
            <div className="flex rounded-lg bg-slate-100 p-1 text-xs">
              <button
                onClick={() => setChannel("whatsapp")}
                className={`rounded px-2.5 py-1 font-semibold transition-all ${
                  channel === "whatsapp" ? "bg-white text-teal-800 shadow-sm" : "text-slate-600"
                }`}
              >
                WhatsApp
              </button>
              <button
                onClick={() => setChannel("email")}
                className={`rounded px-2.5 py-1 font-semibold transition-all ${
                  channel === "email" ? "bg-white text-teal-800 shadow-sm" : "text-slate-600"
                }`}
              >
                Email
              </button>
            </div>
          </div>

          {channel === "whatsapp" ? (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Recipient Mobile Number *</label>
                <input
                  type="text"
                  placeholder="e.g. +919876543210"
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Template</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  value={waTemplate}
                  onChange={(e) => setWaTemplate(e.target.value)}
                >
                  <option value="CLINIC_UPDATE">CLINIC_UPDATE</option>
                  <option value="APPOINTMENT_REMINDER">APPOINTMENT_REMINDER</option>
                  <option value="VAX_REMINDER">VAX_REMINDER</option>
                  <option value="DEWORM_REMINDER">DEWORM_REMINDER</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Message Content</label>
                <textarea
                  rows={4}
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  value={waBody}
                  onChange={(e) => setWaBody(e.target.value)}
                />
              </div>

              <Button
                className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                onClick={() => sendWhatsAppMutation.mutate()}
                disabled={!waPhone || sendWhatsAppMutation.isPending}
              >
                {sendWhatsAppMutation.isPending ? "Queuing…" : "Send WhatsApp Message →"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Recipient Email Address *</label>
                <input
                  type="email"
                  placeholder="e.g. petowner@example.com"
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Subject</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Email Body</label>
                <textarea
                  rows={4}
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm font-sans"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                />
              </div>

              <Button
                className="mt-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold"
                onClick={() => sendEmailMutation.mutate()}
                disabled={!emailTo || sendEmailMutation.isPending}
              >
                {sendEmailMutation.isPending ? "Queuing…" : "Send Email Dispatch →"}
              </Button>
            </div>
          )}
        </div>

        {/* Middle/Right: PRM Engine Rules & Outbox Status Strip */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5 shadow-sm">
            <h3 className="text-base font-bold text-teal-900">PRM Automated Reminder Engine</h3>
            <p className="text-xs text-teal-800 mt-1">
              VetOS continuously checks clinical schedules and dispatches reminders with automated deduplication:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 text-xs">
              <div className="rounded-lg bg-white p-3 border border-teal-100">
                <p className="font-bold text-teal-900">Appointments in 24h</p>
                <p className="text-slate-500 mt-1">Sends WhatsApp reminder with patient name, start time & clinic address.</p>
              </div>
              <div className="rounded-lg bg-white p-3 border border-teal-100">
                <p className="font-bold text-teal-900">Vaccinations Due (7d)</p>
                <p className="text-slate-500 mt-1">Alerts owner regarding upcoming booster vaccine dose requirements.</p>
              </div>
              <div className="rounded-lg bg-white p-3 border border-teal-100">
                <p className="font-bold text-teal-900">Parasite Prevention (7d)</p>
                <p className="text-slate-500 mt-1">Reminds owner of upcoming deworming and flea/tick medication date.</p>
              </div>
            </div>
          </div>

          {/* Outbox Activity Table */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Asynchronous Outbox Events Monitor</h3>
                <p className="text-xs text-slate-500">Live delivery queue processed by background workers (claim lock pattern)</p>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                Worker Live (5s)
              </span>
            </div>

            {outbox.isLoading ? (
              <p className="text-sm text-slate-500 py-8">Loading outbox events…</p>
            ) : (outbox.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No outbox events recorded yet.</p>
            ) : (
              <div className="overflow-x-auto mt-3">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 uppercase text-[10px] text-slate-400 font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Event Type</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Payload Details</th>
                      <th className="px-3 py-2">Created At</th>
                      <th className="px-3 py-2">Processed At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {outbox.data?.map((event: OutboxEvent) => (
                      <tr key={event.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2.5 font-bold text-slate-800">{event.eventType}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              event.status === "PROCESSED"
                                ? "bg-emerald-100 text-emerald-800"
                                : event.status === "PENDING"
                                ? "bg-amber-100 text-amber-800 animate-pulse"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {event.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 max-w-xs truncate">
                          {JSON.stringify(event.payload)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">
                          {new Date(event.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">
                          {event.processedAt ? new Date(event.processedAt).toLocaleTimeString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
