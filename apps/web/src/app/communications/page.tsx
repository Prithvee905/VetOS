"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  listOutboxEvents,
  sendEmail,
  sendWhatsApp,
  triggerReminders,
  getReminderCohorts,
  broadcastToCohort,
  listClients,
  listPatients,
  getClinicProfile,
  type OutboxEvent,
  type ReminderRunSummary,
  type ReminderCohortsDto,
  type BroadcastPayload,
  type ClientRow,
  type PatientRow,
} from "@/lib/api";
import {
  MessageSquare,
  Users,
  Calendar,
  Syringe,
  Bug,
  Sparkles,
  Send,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Volume2,
  RefreshCw,
  Search,
  Filter,
  Check,
} from "lucide-react";

type CampaignTab = "FOLLOWUPS" | "VACCINES" | "DEWORMING" | "LAPSED" | "ANNOUNCEMENTS" | "DIRECT";

export default function CommunicationsHubPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<CampaignTab>("FOLLOWUPS");
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");

  // Direct dispatch states
  const [selectedClientPatientId, setSelectedClientPatientId] = useState("");
  const [waPhone, setWaPhone] = useState("");
  const [waTemplate, setWaTemplate] = useState("CLINIC_UPDATE");
  const [waBody, setWaBody] = useState("Hello! This is a message from your veterinary clinic regarding your upcoming visit.");

  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("Veterinary Care Follow-up - VetOS Clinic");
  const [emailBody, setEmailBody] = useState(
    "Dear Pet Parent,\n\nThank you for choosing our clinic. Please find attached your pet's care notes and updates.\n\nWarm regards,\nVetOS Team"
  );

  // Broadcast campaign customized message overrides
  const [campaignMessages, setCampaignMessages] = useState<Record<string, string>>({
    FOLLOWUPS: "Hello {owner_name}, reminder from {clinic_name}: {pet_name}'s clinical follow-up checkup is due on {due_date}. Please visit to evaluate recovery.",
    VACCINES: "Hello {owner_name}, friendly reminder from {clinic_name}: {pet_name}'s vaccination booster is due on {due_date}. Keep your pet protected!",
    DEWORMING: "Hello {owner_name}, reminder from {clinic_name}: {pet_name}'s deworming & parasite prevention is due on {due_date}.",
    LAPSED: "Hello {owner_name}, we miss {pet_name} at {clinic_name}! It's been over 2 months since your last visit. Book a routine wellness screening today to keep them healthy.",
    ANNOUNCEMENTS: "Dear Pet Parent {owner_name}, warm greetings from {clinic_name}! We are offering free dental hygiene checks this week. Call or message us to reserve a slot.",
  });

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Queries
  const cohortsQuery = useQuery({
    queryKey: ["reminder-cohorts"],
    queryFn: getReminderCohorts,
    refetchInterval: 15_000,
  });

  const clientsQuery = useQuery({
    queryKey: ["clients"],
    queryFn: () => listClients(),
  });

  const patientsQuery = useQuery({
    queryKey: ["patients"],
    queryFn: () => listPatients(),
  });

  const clinicProfile = useQuery({
    queryKey: ["clinic-profile"],
    queryFn: getClinicProfile,
  });

  const outbox = useQuery({
    queryKey: ["outbox-events"],
    queryFn: () => listOutboxEvents(50),
    refetchInterval: 4_000,
  });

  // Client + Patient merged list for easy auto-complete
  const petParentOptions = useMemo(() => {
    const clients = clientsQuery.data || [];
    const patients = patientsQuery.data || [];
    const options: { id: string; label: string; ownerName: string; petName: string; phone: string; email: string }[] = [];

    for (const p of patients) {
      const owner = clients.find((c) => c.id === p.clientId);
      if (owner) {
        options.push({
          id: `${p.id}_${owner.id}`,
          label: `${p.name} (${p.speciesCode}) — Owner: ${owner.displayName} • ${owner.phone || "No phone"}`,
          ownerName: owner.displayName,
          petName: p.name,
          phone: owner.phone || "",
          email: owner.email || "",
        });
      }
    }
    for (const c of clients) {
      if (!options.some((o) => o.id.endsWith(c.id))) {
        options.push({
          id: `client_${c.id}`,
          label: `${c.displayName} (Pet Parent) • ${c.phone || "No phone"}`,
          ownerName: c.displayName,
          petName: "Pet",
          phone: c.phone || "",
          email: c.email || "",
        });
      }
    }
    return options;
  }, [clientsQuery.data, patientsQuery.data]);

  function handleSelectPetParent(optionId: string) {
    setSelectedClientPatientId(optionId);
    const selected = petParentOptions.find((o) => o.id === optionId);
    if (!selected) return;

    if (selected.phone) {
      setWaPhone(selected.phone);
    }
    if (selected.email) {
      setEmailTo(selected.email);
    }
    const cName = clinicProfile.data?.name || "VetOS Animal Hospital";
    setWaBody(`Hello ${selected.ownerName}, reminder from ${cName} regarding ${selected.petName}. Please let us know if you have any questions.`);
    setEmailBody(`Dear ${selected.ownerName},\n\nThis is a care follow-up from ${cName} regarding ${selected.petName}.\n\nWarm regards,\n${cName} Team`);
  }

  function getWhatsAppUrl(phone: string, text: string) {
    const clean = (phone || "").replace(/[^0-9]/g, "");
    const formatted = clean.startsWith("91") ? clean : clean.length === 10 ? `91${clean}` : clean;
    return `https://wa.me/${formatted}?text=${encodeURIComponent(text)}`;
  }

  // Mutations
  const sendWhatsAppMutation = useMutation({
    mutationFn: () => sendWhatsApp({ to: waPhone, template: waTemplate, body: waBody }),
    onSuccess: async () => {
      setMessage(`WhatsApp message dispatched to ${waPhone} and queued to outbox.`);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["outbox-events"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to queue WhatsApp message"),
  });

  const sendEmailMutation = useMutation({
    mutationFn: () => sendEmail({ to: emailTo, subject: emailSubject, body: emailBody }),
    onSuccess: async () => {
      setMessage(`Email queued to ${emailTo} in outbox.`);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["outbox-events"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to queue email"),
  });

  const triggerRemindersMutation = useMutation({
    mutationFn: triggerReminders,
    onSuccess: async (summary: ReminderRunSummary) => {
      setMessage(
        `Automated PRM Scan Dispatched: ${summary.appointmentsReminded} appointments, ${summary.vaccinationsReminded} vaccines, ${summary.dewormingsReminded} dewormings, and ${summary.followupsReminded ?? 0} follow-ups queued to outbox.`
      );
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["outbox-events"] });
      await queryClient.invalidateQueries({ queryKey: ["reminder-cohorts"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to trigger automated reminders"),
  });

  const broadcastMutation = useMutation({
    mutationFn: (body: BroadcastPayload) => broadcastToCohort(body),
    onSuccess: async (result) => {
      setMessage(`Campaign "${result.name}" queued: ${result.sentCount} messages, ${result.skippedOptOut} skipped (opt-out/consent).`);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["outbox-events"] });
      await queryClient.invalidateQueries({ queryKey: ["reminder-cohorts"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to execute broadcast campaign"),
  });

  const cohorts = cohortsQuery.data;
  const clinicName = clinicProfile.data?.name || "VetOS Animal Hospital";

  return (
    <div className="flex flex-col gap-6 pb-20">
      {/* Header & Status */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Patient Relationship Management & Broadcast Hub</h2>
            <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
              Automated Daily 09:00 AM Engine Active
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Targeted customer broadcast campaigns, 1-click WhatsApp web dispatch, and automatic clinical follow-up scheduling.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            className="bg-teal-700 hover:bg-teal-800 text-white font-semibold flex items-center gap-1.5 shadow-sm"
            onClick={() => triggerRemindersMutation.mutate()}
            disabled={triggerRemindersMutation.isPending}
          >
            <Sparkles className="h-4 w-4" />
            <span>{triggerRemindersMutation.isPending ? "Scanning..." : "⚡ Run Automated Daily PRM Engine"}</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["outbox-events"] });
              queryClient.invalidateQueries({ queryKey: ["reminder-cohorts"] });
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {message && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Campaign Category Navigation Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("FOLLOWUPS")}
          className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
            activeTab === "FOLLOWUPS"
              ? "border-teal-600 bg-teal-50/70 shadow-xs ring-1 ring-teal-600"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-base">⏰</span>
            <span className="rounded-full bg-amber-100 text-amber-900 font-bold px-2 py-0.5 text-[10px]">
              {cohorts?.followUpsDue.length ?? 0}
            </span>
          </div>
          <span className="font-bold text-xs text-slate-900 mt-1.5">7-Day Follow-ups</span>
          <span className="text-[10px] text-slate-500">Clinical checkup due</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("VACCINES")}
          className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
            activeTab === "VACCINES"
              ? "border-teal-600 bg-teal-50/70 shadow-xs ring-1 ring-teal-600"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-base">💉</span>
            <span className="rounded-full bg-teal-100 text-teal-900 font-bold px-2 py-0.5 text-[10px]">
              {cohorts?.vaccinationsDue.length ?? 0}
            </span>
          </div>
          <span className="font-bold text-xs text-slate-900 mt-1.5">Vaccine Boosters</span>
          <span className="text-[10px] text-slate-500">Core vaccines due</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("DEWORMING")}
          className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
            activeTab === "DEWORMING"
              ? "border-teal-600 bg-teal-50/70 shadow-xs ring-1 ring-teal-600"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-base">🪱</span>
            <span className="rounded-full bg-blue-100 text-blue-900 font-bold px-2 py-0.5 text-[10px]">
              {cohorts?.dewormingsDue.length ?? 0}
            </span>
          </div>
          <span className="font-bold text-xs text-slate-900 mt-1.5">Deworming / Fleas</span>
          <span className="text-[10px] text-slate-500">Parasite prevention</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("LAPSED")}
          className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
            activeTab === "LAPSED"
              ? "border-teal-600 bg-teal-50/70 shadow-xs ring-1 ring-teal-600"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-base">💤</span>
            <span className="rounded-full bg-rose-100 text-rose-900 font-bold px-2 py-0.5 text-[10px]">
              {cohorts?.lapsedClients.length ?? 0}
            </span>
          </div>
          <span className="font-bold text-xs text-slate-900 mt-1.5">Lapsed (&gt;60 Days)</span>
          <span className="text-[10px] text-slate-500">Win-back checkup</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ANNOUNCEMENTS")}
          className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
            activeTab === "ANNOUNCEMENTS"
              ? "border-teal-600 bg-teal-50/70 shadow-xs ring-1 ring-teal-600"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-base">📢</span>
            <span className="rounded-full bg-indigo-100 text-indigo-900 font-bold px-2 py-0.5 text-[10px]">
              {cohorts?.allClients.length ?? 0}
            </span>
          </div>
          <span className="font-bold text-xs text-slate-900 mt-1.5">All Clients</span>
          <span className="text-[10px] text-slate-500">General broadcast</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("DIRECT")}
          className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
            activeTab === "DIRECT"
              ? "border-teal-600 bg-teal-50/70 shadow-xs ring-1 ring-teal-600"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-base">💬</span>
            <span className="rounded-full bg-slate-100 text-slate-700 font-bold px-2 py-0.5 text-[10px]">
              1-to-1
            </span>
          </div>
          <span className="font-bold text-xs text-slate-900 mt-1.5">Direct Message</span>
          <span className="text-[10px] text-slate-500">Auto-fill & WhatsApp</span>
        </button>
      </div>

      {/* Main Campaign / Dispatch Body */}
      {activeTab === "DIRECT" ? (
        /* Direct 1-to-1 Dispatch with Smart Auto-fill */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Direct Message Dispatch</h3>
                <p className="text-xs text-slate-500">Pick any pet parent to auto-fill phone and personalized message.</p>
              </div>
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

            {/* Smart Pet Parent Picker */}
            <div>
              <label className="text-xs font-semibold text-teal-900 flex items-center justify-between">
                <span>Select Pet Parent / Patient (Auto-Fills Number) *</span>
                <span className="text-[10px] text-slate-400">{petParentOptions.length} registered</span>
              </label>
              <select
                value={selectedClientPatientId}
                onChange={(e) => handleSelectPetParent(e.target.value)}
                className="mt-1 w-full rounded-md border border-teal-300 bg-teal-50/50 p-2 text-xs font-semibold text-teal-950 focus:border-teal-600 focus:bg-white"
              >
                <option value="">-- Choose patient / pet parent to auto-fill --</option>
                {petParentOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {channel === "whatsapp" ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Recipient Mobile Number *</label>
                  <input
                    type="text"
                    placeholder="e.g. +919876543210 (Auto-filled upon pet selection)"
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm font-semibold"
                    value={waPhone}
                    onChange={(e) => setWaPhone(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Template Context</label>
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                    value={waTemplate}
                    onChange={(e) => setWaTemplate(e.target.value)}
                  >
                    <option value="CLINIC_UPDATE">CLINIC_UPDATE (General Note)</option>
                    <option value="FOLLOWUP_REMINDER">FOLLOWUP_REMINDER (Clinical Follow-up)</option>
                    <option value="VAX_REMINDER">VAX_REMINDER (Vaccine Due)</option>
                    <option value="DEWORM_REMINDER">DEWORM_REMINDER (Parasite Prevention)</option>
                    <option value="APPOINTMENT_REMINDER">APPOINTMENT_REMINDER (Visit)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Message Content</label>
                  <textarea
                    rows={4}
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm font-sans"
                    value={waBody}
                    onChange={(e) => setWaBody(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 text-xs shadow-sm flex items-center justify-center gap-1.5"
                    onClick={() => sendWhatsAppMutation.mutate()}
                    disabled={!waPhone || sendWhatsAppMutation.isPending}
                  >
                    <Send className="h-3.5 w-3.5 mr-1" />
                    {sendWhatsAppMutation.isPending ? "Dispatching via Meta API…" : "⚡ Send via WhatsApp Cloud API (Automated)"}
                  </Button>
                  <p className="text-[11px] text-slate-500 text-center">
                    Dispatched directly from the server via official Meta WhatsApp Cloud API.
                  </p>

                  <div className="border-t border-slate-100 pt-2 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Prefer personal 1-on-1 desk chat?</span>
                    <a
                      href={waPhone ? getWhatsAppUrl(waPhone, waBody) : "#"}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-emerald-700 hover:underline ${
                        !waPhone ? "pointer-events-none opacity-40" : ""
                      }`}
                    >
                      <MessageSquare className="h-3 w-3 text-emerald-600" />
                      <span>Optional: Open in WhatsApp Web</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Recipient Email Address *</label>
                  <input
                    type="email"
                    placeholder="e.g. petowner@example.com (Auto-filled upon selection)"
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm font-semibold"
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
                  <Send className="h-3.5 w-3.5 mr-1" />
                  {sendEmailMutation.isPending ? "Queuing…" : "Queue Email to Outbox →"}
                </Button>
              </div>
            )}
          </div>

          {/* Quick Pet Parents Directory */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
              Pet Parents Directory & Quick WhatsApp Launch
            </h3>
            <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto mt-2">
              {petParentOptions.map((opt) => (
                <div key={opt.id} className="py-2.5 flex items-center justify-between text-xs hover:bg-slate-50 px-2 rounded-md">
                  <div>
                    <div className="font-bold text-slate-900">{opt.ownerName}</div>
                    <div className="text-slate-500 text-[11px] flex items-center gap-2">
                      <span className="font-semibold text-teal-800">{opt.petName}</span>
                      <span>•</span>
                      <span>{opt.phone || "No phone"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectPetParent(opt.id)}
                      className="px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 font-semibold text-[11px]"
                    >
                      Use in Composer
                    </button>
                    {opt.phone && (
                      <a
                        href={getWhatsAppUrl(
                          opt.phone,
                          `Hello ${opt.ownerName}, warm greetings from ${clinicName} regarding your pet ${opt.petName}.`
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-2xs"
                      >
                        <MessageSquare className="h-3 w-3" />
                        <span>Chat WhatsApp</span>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Targeted Broadcast Campaign View (Follow-ups, Vaccines, Deworming, Lapsed, Announcements) */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Campaign Message Composer & Batch Action */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800 font-mono">
                BROADCAST CAMPAIGN CONFIGURATION
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                {activeTab === "FOLLOWUPS" && "Clinical Follow-ups (7 Days)"}
                {activeTab === "VACCINES" && "Vaccine Boosters Due (7 Days)"}
                {activeTab === "DEWORMING" && "Parasite & Deworming Due"}
                {activeTab === "LAPSED" && "Lapsed Customers Win-Back (&gt;60 Days)"}
                {activeTab === "ANNOUNCEMENTS" && "All Customers Clinic Broadcast"}
              </h3>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Custom Campaign Message Template</label>
              <p className="text-[11px] text-slate-400 mb-1.5">
                Variables: <code className="bg-slate-100 px-1 rounded text-teal-900 font-bold">&#123;owner_name&#125;</code>, <code className="bg-slate-100 px-1 rounded text-teal-900 font-bold">&#123;pet_name&#125;</code>, <code className="bg-slate-100 px-1 rounded text-teal-900 font-bold">&#123;clinic_name&#125;</code>, <code className="bg-slate-100 px-1 rounded text-teal-900 font-bold">&#123;due_date&#125;</code>
              </p>
              <textarea
                rows={5}
                className="w-full rounded-md border border-slate-300 p-2 text-xs font-sans text-slate-900 focus:border-teal-600 focus:outline-hidden"
                value={campaignMessages[activeTab] || ""}
                onChange={(e) =>
                  setCampaignMessages((prev) => ({
                    ...prev,
                    [activeTab]: e.target.value,
                  }))
                }
              />
            </div>

            {/* Live Preview Card */}
            <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 p-3 text-xs">
              <span className="font-bold text-emerald-900 text-[11px] flex items-center gap-1 mb-1">
                <MessageSquare className="h-3 w-3" /> Live Customer WhatsApp Preview:
              </span>
              <p className="text-slate-800 text-[11px] italic bg-white p-2.5 rounded border border-emerald-100 leading-relaxed">
                {(campaignMessages[activeTab] || "")
                  .replace("{owner_name}", "John Doe")
                  .replace("{pet_name}", "Bruno")
                  .replace("{clinic_name}", clinicName)
                  .replace("{due_date}", "24-Oct-2026")}
              </p>
            </div>

            <Button
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold py-2.5 text-xs shadow-sm flex items-center justify-center gap-1.5"
              disabled={broadcastMutation.isPending}
              onClick={() => {
                const cohortMap: Record<string, BroadcastPayload["cohort"]> = {
                  FOLLOWUPS: "FOLLOWUPS_7D",
                  VACCINES: "VAX_7D",
                  DEWORMING: "DEWORM_7D",
                  LAPSED: "LAPSED_60D",
                  ANNOUNCEMENTS: "ALL_CLIENTS",
                };
                broadcastMutation.mutate({
                  cohort: cohortMap[activeTab] || "ALL_CLIENTS",
                  customMessage: campaignMessages[activeTab] || "",
                });
              }}
            >
              <Send className="h-4 w-4" />
              <span>
                {broadcastMutation.isPending
                  ? "Broadcasting via Meta API…"
                  : `⚡ Broadcast via WhatsApp Cloud API (Automated)`}
              </span>
            </Button>
            <p className="text-[11px] text-slate-500 text-center">
              Sent automatically in the background via official Meta WhatsApp Cloud API.
            </p>
          </div>

          {/* Right Column: Recipient Table with 1-Click WhatsApp Links */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Targeted Recipients & 1-Click Dispatch
                </h3>
                <p className="text-xs text-slate-500">
                  Open individually in WhatsApp Web or batch-queue via outbox.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-800">
                {activeTab === "FOLLOWUPS" && `${cohorts?.followUpsDue.length ?? 0} Due`}
                {activeTab === "VACCINES" && `${cohorts?.vaccinationsDue.length ?? 0} Due`}
                {activeTab === "DEWORMING" && `${cohorts?.dewormingsDue.length ?? 0} Due`}
                {activeTab === "LAPSED" && `${cohorts?.lapsedClients.length ?? 0} Lapsed`}
                {activeTab === "ANNOUNCEMENTS" && `${cohorts?.allClients.length ?? 0} Clients`}
              </span>
            </div>

            <div className="overflow-x-auto mt-3 max-h-[460px] overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 uppercase text-[10px] text-slate-400 font-bold border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5">Pet & Owner</th>
                    <th className="px-3 py-2.5">Mobile</th>
                    <th className="px-3 py-2.5">
                      {activeTab === "LAPSED" ? "Last Visit / Visits" : "Milestone / Due Date"}
                    </th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Followups Cohort */}
                  {activeTab === "FOLLOWUPS" &&
                    ((cohorts?.followUpsDue || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400">
                          🎉 No clinical consultation follow-ups due in the next 7 days!
                        </td>
                      </tr>
                    ) : (
                      (cohorts?.followUpsDue || []).map((f) => {
                        const previewMsg = (campaignMessages.FOLLOWUPS || "")
                          .replace("{owner_name}", f.clientName)
                          .replace("{pet_name}", f.patientName)
                          .replace("{clinic_name}", clinicName)
                          .replace("{due_date}", f.followUpOn);
                        return (
                          <tr key={f.consultationId} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2.5 font-bold text-slate-900">
                              {f.patientName}
                              <span className="block font-normal text-slate-500 text-[11px]">{f.clientName}</span>
                            </td>
                            <td className="px-3 py-2.5 font-mono">{f.phone || "—"}</td>
                            <td className="px-3 py-2.5">
                              <span className="rounded bg-amber-100 text-amber-900 px-2 py-0.5 font-bold text-[10px]">
                                Due: {f.followUpOn}
                              </span>
                              <span className="block text-[10px] text-slate-400">Dr. {f.doctorName}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {f.phone && (
                                <a
                                  href={getWhatsAppUrl(f.phone, previewMsg)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-2.5 py-1 shadow-2xs"
                                >
                                  <MessageSquare className="h-3 w-3" />
                                  <span>WhatsApp</span>
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ))}

                  {/* Vaccines Cohort */}
                  {activeTab === "VACCINES" &&
                    ((cohorts?.vaccinationsDue || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400">
                          🎉 All registered patients are up to date on vaccines!
                        </td>
                      </tr>
                    ) : (
                      (cohorts?.vaccinationsDue || []).map((v) => {
                        const previewMsg = (campaignMessages.VACCINES || "")
                          .replace("{owner_name}", v.clientName)
                          .replace("{pet_name}", v.patientName)
                          .replace("{clinic_name}", clinicName)
                          .replace("{due_date}", v.nextDueOn);
                        return (
                          <tr key={v.id} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2.5 font-bold text-slate-900">
                              {v.patientName}
                              <span className="block font-normal text-slate-500 text-[11px]">{v.clientName}</span>
                            </td>
                            <td className="px-3 py-2.5 font-mono">{v.phone || "—"}</td>
                            <td className="px-3 py-2.5">
                              <span className="rounded bg-teal-100 text-teal-900 px-2 py-0.5 font-bold text-[10px]">
                                Due: {v.nextDueOn}
                              </span>
                              <span className="block text-[10px] text-slate-500 font-medium">{v.vaccineName}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {v.phone && (
                                <a
                                  href={getWhatsAppUrl(v.phone, previewMsg)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-2.5 py-1 shadow-2xs"
                                >
                                  <MessageSquare className="h-3 w-3" />
                                  <span>WhatsApp</span>
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ))}

                  {/* Deworming Cohort */}
                  {activeTab === "DEWORMING" &&
                    ((cohorts?.dewormingsDue || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400">
                          🎉 No parasite prevention or deworming due in the next 7 days!
                        </td>
                      </tr>
                    ) : (
                      (cohorts?.dewormingsDue || []).map((d) => {
                        const previewMsg = (campaignMessages.DEWORMING || "")
                          .replace("{owner_name}", d.clientName)
                          .replace("{pet_name}", d.patientName)
                          .replace("{clinic_name}", clinicName)
                          .replace("{due_date}", d.nextDueOn);
                        return (
                          <tr key={d.id} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2.5 font-bold text-slate-900">
                              {d.patientName}
                              <span className="block font-normal text-slate-500 text-[11px]">{d.clientName}</span>
                            </td>
                            <td className="px-3 py-2.5 font-mono">{d.phone || "—"}</td>
                            <td className="px-3 py-2.5">
                              <span className="rounded bg-blue-100 text-blue-900 px-2 py-0.5 font-bold text-[10px]">
                                Due: {d.nextDueOn}
                              </span>
                              <span className="block text-[10px] text-slate-500 font-medium">{d.productName}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {d.phone && (
                                <a
                                  href={getWhatsAppUrl(d.phone, previewMsg)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-2.5 py-1 shadow-2xs"
                                >
                                  <MessageSquare className="h-3 w-3" />
                                  <span>WhatsApp</span>
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ))}

                  {/* Lapsed Cohort */}
                  {activeTab === "LAPSED" &&
                    ((cohorts?.lapsedClients || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400">
                          No lapsed clients found (all clients have visited within the last 60 days).
                        </td>
                      </tr>
                    ) : (
                      (cohorts?.lapsedClients || []).map((l) => {
                        const previewMsg = (campaignMessages.LAPSED || "")
                          .replace("{owner_name}", l.clientName)
                          .replace("{pet_name}", l.patientNames)
                          .replace("{clinic_name}", clinicName)
                          .replace("{due_date}", "");
                        return (
                          <tr key={l.clientId} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2.5 font-bold text-slate-900">
                              {l.clientName}
                              <span className="block font-semibold text-teal-800 text-[11px]">Pet: {l.patientNames}</span>
                            </td>
                            <td className="px-3 py-2.5 font-mono">{l.phone || "—"}</td>
                            <td className="px-3 py-2.5">
                              <span className="rounded bg-rose-100 text-rose-900 px-2 py-0.5 font-bold text-[10px]">
                                Last Visit: {new Date(l.lastVisit).toLocaleDateString()}
                              </span>
                              <span className="block text-[10px] text-slate-400">{l.visitCount} lifetime visits</span>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {l.phone && (
                                <a
                                  href={getWhatsAppUrl(l.phone, previewMsg)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-2.5 py-1 shadow-2xs"
                                >
                                  <MessageSquare className="h-3 w-3" />
                                  <span>WhatsApp</span>
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ))}

                  {/* All Clients Cohort */}
                  {activeTab === "ANNOUNCEMENTS" &&
                    ((cohorts?.allClients || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-400">
                          No registered clients with mobile numbers found.
                        </td>
                      </tr>
                    ) : (
                      (cohorts?.allClients || []).map((c) => {
                        const previewMsg = (campaignMessages.ANNOUNCEMENTS || "")
                          .replace("{owner_name}", c.clientName)
                          .replace("{pet_name}", c.patientNames)
                          .replace("{clinic_name}", clinicName)
                          .replace("{due_date}", "");
                        return (
                          <tr key={c.clientId} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2.5 font-bold text-slate-900">
                              {c.clientName}
                              <span className="block font-semibold text-teal-800 text-[11px]">Pet: {c.patientNames}</span>
                            </td>
                            <td className="px-3 py-2.5 font-mono">{c.phone || "—"}</td>
                            <td className="px-3 py-2.5 text-slate-500 text-[11px]">Active Client</td>
                            <td className="px-3 py-2.5 text-right">
                              {c.phone && (
                                <a
                                  href={getWhatsAppUrl(c.phone, previewMsg)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] px-2.5 py-1 shadow-2xs"
                                >
                                  <MessageSquare className="h-3 w-3" />
                                  <span>WhatsApp</span>
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Outbox Events Monitor */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Asynchronous Outbox Events Monitor</h3>
            <p className="text-xs text-slate-500">Live delivery queue processed by background workers (claim lock pattern)</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
            Worker Live (4s)
          </span>
        </div>

        {outbox.isLoading ? (
          <p className="text-sm text-slate-500 py-6">Loading outbox events…</p>
        ) : (outbox.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No messages in outbox. Dispatch a message to test.</p>
        ) : (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 uppercase text-[10px] text-slate-400 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5">Event Type</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Attempts</th>
                  <th className="px-3 py-2.5">Created At</th>
                  <th className="px-3 py-2.5">Processed At</th>
                  <th className="px-3 py-2.5">WhatsApp delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {outbox.data?.map((ev: OutboxEvent) => {
                  const isProcessed = ev.status === "PROCESSED";
                  const isFailed = ev.status === "FAILED";
                  return (
                    <tr key={ev.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-900">{ev.eventType}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            isProcessed
                              ? "bg-emerald-100 text-emerald-800"
                              : isFailed
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {ev.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono">{ev.retryCount}</td>
                      <td className="px-3 py-2.5 text-slate-500">{new Date(ev.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-slate-500">
                        {ev.processedAt ? new Date(ev.processedAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 font-mono text-[10px]">
                        {ev.deliveryStatus ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
