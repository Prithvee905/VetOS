"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  apiJson,
  checkInQueue,
  createAppointment,
  createClient,
  createConsultation,
  createPatient,
  createPrescription,
  issueInvoice,
  listAppointments,
  listBranches,
  listClients,
  listPatients,
  listProducts,
  listQueue,
  listServices,
  listUsers,
  recordPayment,
  updateQueueStatus,
  type AppointmentItem,
  type InvoiceRow,
  type PrescriptionRow,
  type QueueEntry,
} from "@/lib/api";

type ActiveTab = "queue" | "appointments" | "soap" | "pos" | "register";

type DifferentialItem = {
  label: string;
  rank: number;
  notes: string;
};

type RxLine = {
  medicineName: string;
  quantity: number;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
};

type BasketLine = {
  id: string;
  sourceType: "PRESCRIPTION" | "SERVICE" | "PRODUCT" | "CUSTOM";
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

export default function ClinicOperationsStation() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>("queue");

  // Global data queries
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => listBranches() });
  const clients = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const users = useQuery({ queryKey: ["users"], queryFn: listUsers });
  const services = useQuery({ queryKey: ["services"], queryFn: listServices });
  const products = useQuery({ queryKey: ["products"], queryFn: () => listProducts() });
  const allAppointments = useQuery({ queryKey: ["appointments"], queryFn: listAppointments, refetchInterval: 10_000 });
  const patients = useQuery({ queryKey: ["patients"], queryFn: () => listPatients() });

  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("vetos_active_branch_id") || "";
    }
    return "";
  });

  const branchId = selectedBranchId || (branches.data?.items[0]?.id ?? "");

  // Queue query with live polling
  const queue = useQuery({
    queryKey: ["queue", branchId],
    queryFn: () => listQueue(branchId),
    enabled: Boolean(branchId),
    refetchInterval: 6_000,
  });

  const defaultDoctors = [
    { id: "01a10a6a-31f7-7041-b2d0-05087cb15cf2", displayName: "Dr. Robert Smith", roles: ["DOCTOR"] },
    { id: "01a10a6c-e6cd-750f-9105-158106ea6c80", displayName: "Dr. Amanda Co-Owner", roles: ["OWNER"] },
    { id: "01a0f8d9-149c-7420-b10b-8dbe914fe1d4", displayName: "Clinic Owner", roles: ["OWNER"] },
  ];

  const doctors = useMemo(() => {
    const list = (users.data?.items ?? []).filter((u) => u.roles.includes("DOCTOR") || u.roles.includes("OWNER"));
    return list.length > 0 ? list : defaultDoctors;
  }, [users.data]);

  // Notifications / feedback
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function notifySuccess(msg: string) {
    setMessage(msg);
    setError(null);
    setTimeout(() => setMessage(null), 5000);
  }

  function notifyError(err: unknown) {
    setError(err instanceof Error ? err.message : "An unexpected error occurred");
    setTimeout(() => setError(null), 7000);
  }

  // ----------------------------------------------------
  // Active Consultation / SOAP State
  // ----------------------------------------------------
  const [activeAppointmentId, setActiveAppointmentId] = useState("");
  const [activePatientId, setActivePatientId] = useState("");
  const [activeDoctorId, setActiveDoctorId] = useState("");
  const [activeQueueEntryId, setActiveQueueEntryId] = useState<string | null>(null);

  // S - Subjective
  const [subjective, setSubjective] = useState("Owner reports pet is lethargic with mild reduced appetite.");
  const [historyNotes, setHistoryNotes] = useState("Vaccinated 6 months ago. No prior chronic conditions.");

  // O - Objective
  const [vitalsExam, setVitalsExam] = useState("Temp: 101.8 F | HR: 110 bpm | RR: 24 bpm | Mucous membranes: Pink, CRT < 2s | Hydration: Normal");

  // A - Assessment
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState("Acute Gastritis / Dietary Indiscretion");
  const [differentials, setDifferentials] = useState<DifferentialItem[]>([
    { label: "Gastroenteritis", rank: 1, notes: "Mild abdominal sensitivity" },
    { label: "Foreign Body Ingestion", rank: 2, notes: "Low probability based on palpation" },
  ]);
  const [newDiffLabel, setNewDiffLabel] = useState("");

  // P - Plan
  const [treatmentPlan, setTreatmentPlan] = useState("Supportive gastroprotectants, hydration, bland diet (boiled chicken/rice) for 3-5 days.");
  const [doctorNotes, setDoctorNotes] = useState("Advise owner to monitor vomiting or worsening lethargy.");
  const [followUpDate, setFollowUpDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().split("T")[0];
  });

  // Prescriptions state
  const [rxLines, setRxLines] = useState<RxLine[]>([
    {
      medicineName: "Amoxicillin Clavulanate",
      quantity: 10,
      dosage: "250mg",
      frequency: "BID (Twice daily)",
      duration: "5 days",
      route: "Oral",
      instructions: "Give with food",
    },
    {
      medicineName: "Pantoprazole",
      quantity: 5,
      dosage: "20mg",
      frequency: "SID (Once daily)",
      duration: "5 days",
      route: "Oral",
      instructions: "Give on empty stomach 30 min before food",
    },
  ]);

  // Last completed artifacts
  const [lastConsultationId, setLastConsultationId] = useState<string | null>(null);
  const [lastPrescription, setLastPrescription] = useState<PrescriptionRow | null>(null);

  // ----------------------------------------------------
  // Unified Basket / POS State
  // ----------------------------------------------------
  const [basketClientId, setBasketClientId] = useState("");
  const [basketLines, setBasketLines] = useState<BasketLine[]>([
    { id: "1", sourceType: "SERVICE", description: "Standard Clinical Consultation", quantity: 1, unitPrice: 500, taxRate: 0 },
  ]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [customItemDesc, setCustomItemDesc] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("250");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [issuedInvoice, setIssuedInvoice] = useState<InvoiceRow | null>(null);

  useEffect(() => {
    try {
      const savedRx = localStorage.getItem("vetos_active_rx");
      if (savedRx) setLastPrescription(JSON.parse(savedRx));
      const savedBasket = localStorage.getItem("vetos_active_basket");
      if (savedBasket) setBasketLines(JSON.parse(savedBasket));
      const savedInv = localStorage.getItem("vetos_active_invoice");
      if (savedInv) setIssuedInvoice(JSON.parse(savedInv));
    } catch {
      // ignore parse errors
    }
  }, []);

  // ----------------------------------------------------
  // Walk-In Registration State
  // ----------------------------------------------------
  const [regClientName, setRegClientName] = useState("");
  const [regClientPhone, setRegClientPhone] = useState("");
  const [regClientEmail, setRegClientEmail] = useState("");
  const [regPetName, setRegPetName] = useState("");
  const [regSpecies, setRegSpecies] = useState("CANINE");
  const [regBreed, setRegBreed] = useState("Golden Retriever");
  const [regSize, setRegSize] = useState("MEDIUM");
  const [regDoctorId, setRegDoctorId] = useState("01a10a6a-31f7-7041-b2d0-05087cb15cf2");

  // ----------------------------------------------------
  // Actions: Queue Triage
  // ----------------------------------------------------
  const updateQueueMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateQueueStatus(id, status),
    onSuccess: async (_, { status }) => {
      await queryClient.invalidateQueries({ queryKey: ["queue"] });
      notifySuccess(`Queue entry updated to ${status}`);
    },
    onError: notifyError,
  });

  function startConsultationForQueueEntry(entry: QueueEntry) {
    setActiveQueueEntryId(entry.id);
    setActiveAppointmentId(entry.appointmentId);
    setActivePatientId(entry.patientId);
    setActiveDoctorId(entry.doctorUserId);
    updateQueueMutation.mutate({ id: entry.id, status: "IN_CONSULTATION" });
    setActiveTab("soap");
  }

  // ----------------------------------------------------
  // Actions: SOAP Station Submission
  // ----------------------------------------------------
  const submitSoapConsultation = useMutation({
    mutationFn: async () => {
      if (!activeAppointmentId) {
        throw new Error("No appointment linked. Please select a patient from the queue or appointments list.");
      }

      // 1. Create Consultation
      const consultRes = await createConsultation({
        appointmentId: activeAppointmentId,
        subjective,
        history: historyNotes,
        examination: vitalsExam,
        assessment: primaryDiagnosis,
        plan: treatmentPlan,
        diagnosis: primaryDiagnosis,
        doctorRemarks: "Consultation conducted via VetOS Clinical Station",
        doctorNotes,
        followUpOn: followUpDate || null,
        differentials: differentials.map((d) => ({
          label: d.label,
          rank: d.rank,
          notes: d.notes,
        })),
      });

      setLastConsultationId(consultRes.id);

      // 2. Create Prescription if medications are added
      let rxRes: PrescriptionRow | null = null;
      if (rxLines.length > 0) {
        rxRes = await createPrescription({
          consultationId: consultRes.id,
          notes: "Dispensed via VetOS Pharmacy Protocol",
          items: rxLines.map((line) => ({
            medicineName: line.medicineName,
            quantity: Number(line.quantity),
            dosage: line.dosage,
            frequency: line.frequency,
            duration: line.duration,
            route: line.route,
            instructions: line.instructions,
          })),
        });
        setLastPrescription(rxRes);
      }

      // 3. If there was an active queue entry, mark it completed
      if (activeQueueEntryId) {
        await updateQueueStatus(activeQueueEntryId, "COMPLETED");
        await queryClient.invalidateQueries({ queryKey: ["queue"] });
      }

      return { consultId: consultRes.id, rx: rxRes };
    },
    onSuccess: (data) => {
      notifySuccess("SOAP Consultation finalized and Prescriptions generated successfully!");
      // Automatically prepopulate the billing basket with the consultation and prescribed meds
      const newLines: BasketLine[] = [
        {
          id: `consult-${data.consultId}`,
          sourceType: "SERVICE",
          description: `Consultation (${primaryDiagnosis})`,
          quantity: 1,
          unitPrice: 500,
          taxRate: 0,
        },
      ];
      if (data.rx?.items) {
        data.rx.items.forEach((item, idx) => {
          newLines.push({
            id: item.id || `rx-${idx}`,
            sourceType: "PRESCRIPTION",
            description: `Rx: ${item.medicineName} (${item.dosage}, ${item.duration})`,
            quantity: Number(item.quantity) || 1,
            unitPrice: 150,
            taxRate: 0,
          });
        });
      }
      setBasketLines(newLines);
      if (typeof window !== "undefined") {
        if (data.rx) localStorage.setItem("vetos_active_rx", JSON.stringify(data.rx));
        localStorage.setItem("vetos_active_basket", JSON.stringify(newLines));
      }
    },
    onError: notifyError,
  });

  // ----------------------------------------------------
  // Actions: Unified Basket / Billing
  // ----------------------------------------------------
  const basketTotal = useMemo(() => {
    return basketLines.reduce((acc, line) => acc + line.quantity * line.unitPrice, 0);
  }, [basketLines]);

  function addServiceToBasket() {
    if (!selectedServiceId) return;
    const s = services.data?.find((item) => item.id === selectedServiceId);
    if (!s) return;
    setBasketLines((prev) => [
      ...prev,
      {
        id: `svc-${s.id}-${Date.now()}`,
        sourceType: "SERVICE",
        description: s.name,
        quantity: 1,
        unitPrice: s.defaultPrice,
        taxRate: 0,
      },
    ]);
    setSelectedServiceId("");
  }

  function addProductToBasket() {
    if (!selectedProductId) return;
    const p = products.data?.find((item) => item.id === selectedProductId);
    if (!p) return;
    setBasketLines((prev) => [
      ...prev,
      {
        id: `prod-${p.id}-${Date.now()}`,
        sourceType: "PRODUCT",
        description: p.name,
        quantity: 1,
        unitPrice: p.salePrice,
        taxRate: 0,
      },
    ]);
    setSelectedProductId("");
  }

  function addCustomItemToBasket() {
    if (!customItemDesc.trim()) return;
    setBasketLines((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        sourceType: "CUSTOM",
        description: customItemDesc.trim(),
        quantity: 1,
        unitPrice: Number(customItemPrice) || 0,
        taxRate: 0,
      },
    ]);
    setCustomItemDesc("");
    setCustomItemPrice("250");
  }

  function removeBasketLine(index: number) {
    setBasketLines((prev) => prev.filter((_, i) => i !== index));
  }

  const issueUnifiedInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (basketLines.length === 0) {
        throw new Error("Cannot issue invoice for an empty basket.");
      }

      if (lastPrescription) {
        const linePrices = lastPrescription.items.map((item) => {
          // match in basket or default
          const match = basketLines.find((b) => b.description.includes(item.medicineName));
          return {
            prescriptionItemId: item.id,
            unitPrice: match ? match.unitPrice : 150,
          };
        });
        return issueInvoice({
          prescriptionId: lastPrescription.id,
          linePrices,
        });
      }

      // Standalone POS sale (Retail / Service / Counter Walk-in)
      const lines = basketLines.map((line) => ({
        sourceType: line.sourceType || "CUSTOM",
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: 0,
        taxRate: line.taxRate || 0,
      }));

      return issueInvoice({
        branchId: branchId || undefined,
        patientId: activePatientId || undefined,
        clientId: basketClientId || undefined,
        lines,
      });
    },
    onSuccess: (inv) => {
      setIssuedInvoice(inv);
      if (typeof window !== "undefined") {
        localStorage.setItem("vetos_active_invoice", JSON.stringify(inv));
      }
      notifySuccess(`Invoice #${inv.invoiceNumber} created. Total due: $${inv.total}`);
    },
    onError: notifyError,
  });

  const payUnifiedInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!issuedInvoice) throw new Error("Please issue invoice first");
      const remaining = Number(issuedInvoice.total) - Number(issuedInvoice.amountPaid);
      const idempotencyKey = `pay-${issuedInvoice.id}-${Date.now()}`;
      await recordPayment(issuedInvoice.id, String(remaining), idempotencyKey, paymentMethod);
    },
    onSuccess: () => {
      notifySuccess("Payment received and settled successfully! Receipt marked PAID.");
      setIssuedInvoice(null);
      setBasketLines([]);
      if (typeof window !== "undefined") {
        localStorage.removeItem("vetos_active_rx");
        localStorage.removeItem("vetos_active_basket");
        localStorage.removeItem("vetos_active_invoice");
      }
    },
    onError: notifyError,
  });

  // ----------------------------------------------------
  // Actions: Walk-In Registration
  // ----------------------------------------------------
  const executeWalkInRegistration = useMutation({
    mutationFn: async () => {
      if (!regClientName || !regPetName || !regDoctorId) {
        throw new Error("Please fill in Owner Name, Pet Name, and Assigned Doctor.");
      }

      // 1. Client
      const client = await createClient({
        displayName: regClientName,
        phone: regClientPhone || "9999999999",
        email: regClientEmail || undefined,
        consentWhatsapp: true,
        consentEmail: true,
      });

      // 2. Patient
      const patient = await createPatient({
        clientId: client.id,
        name: regPetName,
        speciesCode: regSpecies,
        breed: regBreed,
        sizeCategory: regSize,
      });

      // 3. Appointment (Now)
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 60 * 1000);
      const appt = await createAppointment({
        branchId,
        patientId: patient.id,
        doctorUserId: regDoctorId,
        startsAt: now.toISOString(),
        endsAt: end.toISOString(),
        notes: "Walk-in consultation",
      });

      // 4. Check in to queue immediately
      const qEntry = await checkInQueue(appt.id);

      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      await queryClient.invalidateQueries({ queryKey: ["patients"] });
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      await queryClient.invalidateQueries({ queryKey: ["queue"] });

      return { client, patient, appt, token: qEntry.tokenNumber };
    },
    onSuccess: (res) => {
      notifySuccess(`Walk-in registered! ${res.patient.name} checked in as Queue Token #${res.token}`);
      setRegClientName("");
      setRegPetName("");
      setRegClientPhone("");
      setActiveTab("queue");
    },
    onError: notifyError,
  });

  return (
    <div className="flex flex-col gap-6 pb-20">
      {/* Top Banner / Notification alerts */}
      {message && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Success:</span>
            <span>{message}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-lg bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Error:</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-900 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Enterprise Station Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab("queue")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === "queue"
                ? "bg-teal-700 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span>Live Queue Triage</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                activeTab === "queue" ? "bg-teal-900 text-teal-100" : "bg-slate-300 text-slate-800"
              }`}
            >
              {queue.data?.length ?? 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("appointments")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === "appointments"
                ? "bg-teal-700 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span>Appointments & Roster</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                activeTab === "appointments" ? "bg-teal-900 text-teal-100" : "bg-slate-300 text-slate-800"
              }`}
            >
              {allAppointments.data?.length ?? 0}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("soap")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === "soap"
                ? "bg-teal-700 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span>SOAP Consultation Station</span>
            {activeAppointmentId && (
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" title="Active Patient Loaded" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("pos")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === "pos"
                ? "bg-teal-700 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span>Unified Basket & POS</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                activeTab === "pos" ? "bg-teal-900 text-teal-100" : "bg-slate-300 text-slate-800"
              }`}
            >
              {basketLines.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("register")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === "register"
                ? "bg-teal-700 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span>+ Quick Walk-In</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
          <label htmlFor="branch-switcher-select" className="font-semibold text-slate-700">Branch:</label>
          <select
            id="branch-switcher-select"
            aria-label="Active Branch"
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            value={branchId}
            onChange={(e) => {
              setSelectedBranchId(e.target.value);
              if (typeof window !== "undefined") {
                localStorage.setItem("vetos_active_branch_id", e.target.value);
              }
            }}
          >
            {(branches.data?.items ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: LIVE QUEUE TRIAGE BOARD                                            */}
      {/* ========================================================================= */}
      {activeTab === "queue" && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Live Clinical Queue & Triage</h2>
              <p className="text-sm text-slate-500">
                Patients waiting in clinic. Auto-refreshes every 6 seconds.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["queue"] })}
            >
              ↻ Refresh Now
            </Button>
          </div>

          {queue.isLoading ? (
            <p className="text-sm text-slate-500 py-8">Loading queue records…</p>
          ) : (queue.data ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <p className="text-base font-semibold text-slate-700">No patients currently in queue</p>
              <p className="text-sm text-slate-500 mt-1">
                Check in an existing appointment or register a walk-in patient.
              </p>
              <div className="mt-4 flex justify-center gap-3">
                <Button size="sm" onClick={() => setActiveTab("appointments")}>
                  View Appointments
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveTab("register")}>
                  Register Walk-In
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {queue.data?.map((entry) => {
                const isEmergency = entry.priority === "EMERGENCY";
                const isConsulting = entry.status === "IN_CONSULTATION";
                const doctor = users.data?.items.find((u) => u.id === entry.doctorUserId);

                return (
                  <div
                    key={entry.id}
                    className={`rounded-xl border p-5 shadow-sm transition-all ${
                      isEmergency
                        ? "border-rose-300 bg-rose-50/50 shadow-rose-100"
                        : isConsulting
                        ? "border-amber-300 bg-amber-50/40"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-800 text-sm font-bold text-white">
                          #{entry.tokenNumber}
                        </span>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Token #{entry.tokenNumber}</p>
                          <p className="text-sm font-bold text-slate-900">
                            {patients.data?.find((p) => p.id === entry.patientId)?.name ?? `Patient ${entry.patientId.slice(0, 8)}…`}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {patients.data?.find((p) => p.id === entry.patientId)?.speciesCode ?? ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {isEmergency ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-bold text-white animate-pulse">
                            EMERGENCY
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            NORMAL
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            isConsulting
                              ? "bg-amber-100 text-amber-900"
                              : "bg-teal-50 text-teal-700"
                          }`}
                        >
                          {entry.status}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600 space-y-1">
                      <p>
                        <span className="text-slate-400 font-medium">Doctor:</span>{" "}
                        <span className="font-semibold text-slate-800">{doctor?.displayName ?? "Any available"}</span>
                      </p>
                      <p>
                        <span className="text-slate-400 font-medium">Checked in:</span>{" "}
                        {new Date(entry.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                      <Button
                        size="sm"
                        className="flex-1 bg-teal-700 hover:bg-teal-800 text-white"
                        onClick={() => startConsultationForQueueEntry(entry)}
                      >
                        Start SOAP Consult →
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateQueueMutation.mutate({ id: entry.id, status: "COMPLETED" })}
                      >
                        Done
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-rose-600 hover:bg-rose-50"
                        onClick={() => updateQueueMutation.mutate({ id: entry.id, status: "NO_SHOW" })}
                      >
                        No Show
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: APPOINTMENTS & DOCTOR ROSTER                                       */}
      {/* ========================================================================= */}
      {activeTab === "appointments" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Doctor Roster & Daily Appointments</h2>
              <p className="text-sm text-slate-500">
                Schedule consultations and check in patients into the live queue.
              </p>
            </div>
            <Button size="sm" onClick={() => setActiveTab("register")}>
              + New Appointment / Walk-In
            </Button>
          </div>

          {allAppointments.isLoading ? (
            <p className="text-sm text-slate-500 py-8">Loading schedule…</p>
          ) : (allAppointments.data ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <p className="text-base font-semibold text-slate-700">No scheduled appointments found</p>
              <Button className="mt-3" size="sm" onClick={() => setActiveTab("register")}>
                Book First Appointment
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Patient ID</th>
                    <th className="px-4 py-3">Doctor</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Notes</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allAppointments.data?.map((appt) => {
                    const doc = users.data?.items.find((u) => u.id === appt.doctorUserId);
                    const canCheckIn = appt.status === "SCHEDULED" || appt.status === "CONFIRMED";

                    return (
                      <tr key={appt.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {new Date(appt.startsAt).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {appt.patientId.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-3 text-slate-800 font-medium">
                          {doc?.displayName ?? "General Doctor"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              appt.status === "CHECKED_IN"
                                ? "bg-emerald-100 text-emerald-800"
                                : appt.status === "COMPLETED"
                                ? "bg-slate-100 text-slate-600"
                                : "bg-sky-100 text-sky-800"
                            }`}
                          >
                            {appt.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{appt.notes || "—"}</td>
                        <td className="px-4 py-3 text-right">
                          {canCheckIn ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-teal-700 border-teal-300 hover:bg-teal-50"
                              onClick={async () => {
                                try {
                                  const q = await checkInQueue(appt.id);
                                  await queryClient.invalidateQueries({ queryKey: ["appointments"] });
                                  await queryClient.invalidateQueries({ queryKey: ["queue"] });
                                  notifySuccess(`Checked in! Assigned Queue Token #${q.tokenNumber}`);
                                } catch (e) {
                                  notifyError(e);
                                }
                              }}
                            >
                              Check-In to Queue
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setActiveAppointmentId(appt.id);
                                setActivePatientId(appt.patientId);
                                setActiveDoctorId(appt.doctorUserId);
                                setActiveTab("soap");
                              }}
                            >
                              Open SOAP
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: FULL SOAP CONSULTATION STATION                                     */}
      {/* ========================================================================= */}
      {activeTab === "soap" && (
        <div className="flex flex-col gap-6">
          {/* Active Context Banner */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-teal-800">Active Consultation Session</p>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <span className="text-sm font-semibold text-slate-900">
                  Patient: <span className="font-mono text-teal-900">{activePatientId ? activePatientId.slice(0, 10) + "…" : "None selected"}</span>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-sm font-semibold text-slate-900">
                  Appointment: <span className="font-mono text-teal-900">{activeAppointmentId ? activeAppointmentId.slice(0, 10) + "…" : "None"}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("queue")}
              >
                Select from Queue
              </Button>
              <Button
                size="sm"
                className="bg-teal-700 hover:bg-teal-800 text-white"
                onClick={() => submitSoapConsultation.mutate()}
                disabled={!activeAppointmentId || submitSoapConsultation.isPending}
              >
                {submitSoapConsultation.isPending ? "Finalizing…" : "Finalize Consult & Rx ✓"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* S: Subjective */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-800 text-xs font-bold text-white">
                  S
                </span>
                <h3 className="text-base font-bold text-slate-900">Subjective (History & Owner Observations)</h3>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Chief Complaint & Onset</label>
                <textarea
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-teal-600 focus:outline-none"
                  value={subjective}
                  onChange={(e) => setSubjective(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Medical History & Diet</label>
                <textarea
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-teal-600 focus:outline-none"
                  value={historyNotes}
                  onChange={(e) => setHistoryNotes(e.target.value)}
                />
              </div>
            </div>

            {/* O: Objective */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-800 text-xs font-bold text-white">
                  O
                </span>
                <h3 className="text-base font-bold text-slate-900">Objective (Vitals & Physical Exam)</h3>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Physical Exam, TPR & Clinical Observations</label>
                <textarea
                  rows={5}
                  className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-teal-600 focus:outline-none font-mono text-xs"
                  value={vitalsExam}
                  onChange={(e) => setVitalsExam(e.target.value)}
                />
              </div>
            </div>

            {/* A: Assessment */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-800 text-xs font-bold text-white">
                  A
                </span>
                <h3 className="text-base font-bold text-slate-900">Assessment (Diagnosis & Differentials)</h3>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Primary Diagnosis</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm font-semibold text-slate-900 focus:border-teal-600 focus:outline-none"
                  value={primaryDiagnosis}
                  onChange={(e) => setPrimaryDiagnosis(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Differential Diagnoses (Ranked)</label>
                <div className="mt-2 space-y-2">
                  {differentials.map((diff, index) => (
                    <div key={index} className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs">
                      <div>
                        <span className="font-bold text-slate-800">#{diff.rank}. {diff.label}</span>
                        {diff.notes && <span className="text-slate-500 ml-2">({diff.notes})</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDifferentials((prev) => prev.filter((_, i) => i !== index))}
                        className="text-slate-400 hover:text-rose-600 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="Add differential diagnosis…"
                    className="flex-1 rounded-md border border-slate-300 px-3 py-1 text-xs"
                    value={newDiffLabel}
                    onChange={(e) => setNewDiffLabel(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!newDiffLabel.trim()) return;
                      setDifferentials((prev) => [
                        ...prev,
                        { label: newDiffLabel.trim(), rank: prev.length + 1, notes: "Clinical suspicion" },
                      ]);
                      setNewDiffLabel("");
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {/* P: Plan */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-800 text-xs font-bold text-white">
                  P
                </span>
                <h3 className="text-base font-bold text-slate-900">Plan (Treatment & Follow-Up)</h3>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Treatment Plan & Procedures</label>
                <textarea
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm focus:border-teal-600 focus:outline-none"
                  value={treatmentPlan}
                  onChange={(e) => setTreatmentPlan(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Discharge Notes to Owner</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs focus:border-teal-600 focus:outline-none"
                    value={doctorNotes}
                    onChange={(e) => setDoctorNotes(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Next Follow-Up Date</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs focus:border-teal-600 focus:outline-none"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Integrated Digital Prescription Writer */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Digital Prescription (Rx)</h3>
                <p className="text-xs text-slate-500">Meds will automatically be sent to pharmacy and billing basket.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setRxLines((prev) => [
                    ...prev,
                    {
                      medicineName: "",
                      quantity: 1,
                      dosage: "1 tab",
                      frequency: "BID",
                      duration: "5 days",
                      route: "Oral",
                      instructions: "With food",
                    },
                  ])
                }
              >
                + Add Medication
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {rxLines.map((line, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-7 gap-2 rounded-lg bg-slate-50 p-3 border border-slate-200 text-xs">
                  <div className="md:col-span-2">
                    <label className="font-semibold text-slate-600">Medicine Name</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded border border-slate-300 p-1.5"
                      value={line.medicineName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRxLines((prev) => prev.map((item, i) => (i === index ? { ...item, medicineName: val } : item)));
                      }}
                      placeholder="e.g. Amoxicillin"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600">Qty</label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded border border-slate-300 p-1.5"
                      value={line.quantity}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setRxLines((prev) => prev.map((item, i) => (i === index ? { ...item, quantity: val } : item)));
                      }}
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600">Dosage</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded border border-slate-300 p-1.5"
                      value={line.dosage}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRxLines((prev) => prev.map((item, i) => (i === index ? { ...item, dosage: val } : item)));
                      }}
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600">Freq / Duration</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded border border-slate-300 p-1.5"
                      value={`${line.frequency} (${line.duration})`}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRxLines((prev) => prev.map((item, i) => (i === index ? { ...item, frequency: val } : item)));
                      }}
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600">Instructions</label>
                    <input
                      type="text"
                      className="mt-1 w-full rounded border border-slate-300 p-1.5"
                      value={line.instructions}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRxLines((prev) => prev.map((item, i) => (i === index ? { ...item, instructions: val } : item)));
                      }}
                    />
                  </div>
                  <div className="flex items-end justify-center">
                    <button
                      type="button"
                      onClick={() => setRxLines((prev) => prev.filter((_, i) => i !== index))}
                      className="p-1 text-slate-400 hover:text-rose-600 font-bold"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                className="bg-teal-700 hover:bg-teal-800 text-white"
                onClick={() => submitSoapConsultation.mutate()}
                disabled={!activeAppointmentId || submitSoapConsultation.isPending}
              >
                {submitSoapConsultation.isPending ? "Finalizing…" : "Finalize Consult & Rx ✓"}
              </Button>
              {lastPrescription && (
                <Button
                  variant="outline"
                  onClick={() => setActiveTab("pos")}
                >
                  Proceed to Invoice Basket →
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: UNIFIED INVOICE BASKET & POS                                       */}
      {/* ========================================================================= */}
      {activeTab === "pos" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Unified Invoice Basket & Clinic POS</h2>
              <p className="text-sm text-slate-500">
                Consolidated billing for consultation fees, dispensed prescriptions, and retail products.
              </p>
            </div>
            {issuedInvoice && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                Invoice #{issuedInvoice.invoiceNumber} Ready for Payment
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Quick Add Items to Basket */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Add to Basket</h3>

              {/* Service Catalog Item */}
              <div>
                <label className="text-xs font-semibold text-slate-600">Add Clinic Catalog Service</label>
                <div className="mt-1 flex gap-2">
                  <select
                    className="w-full rounded-md border border-slate-300 p-2 text-xs"
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                  >
                    <option value="">Select clinical service…</option>
                    {(services.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (${s.defaultPrice})
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" onClick={addServiceToBasket}>
                    Add
                  </Button>
                </div>
              </div>

              {/* Pharmacy / Inventory Item */}
              <div>
                <label className="text-xs font-semibold text-slate-600">Add Pharmacy / Retail Product</label>
                <div className="mt-1 flex gap-2">
                  <select
                    className="w-full rounded-md border border-slate-300 p-2 text-xs"
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                  >
                    <option value="">Select inventory product…</option>
                    {(products.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (${p.salePrice})
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" onClick={addProductToBasket}>
                    Add
                  </Button>
                </div>
              </div>

              {/* Custom Line Item */}
              <div className="border-t border-slate-100 pt-3">
                <label className="text-xs font-semibold text-slate-600">Custom Line Item</label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="custom-item-desc"
                    type="text"
                    placeholder="Description (e.g. Nail trim)"
                    className="flex-1 rounded-md border border-slate-300 p-2 text-xs"
                    value={customItemDesc}
                    onChange={(e) => setCustomItemDesc(e.target.value)}
                  />
                  <input
                    id="custom-item-price"
                    type="number"
                    className="w-20 rounded-md border border-slate-300 p-2 text-xs"
                    value={customItemPrice}
                    onChange={(e) => setCustomItemPrice(e.target.value)}
                  />
                  <Button id="btn-add-custom-item" size="sm" variant="outline" onClick={addCustomItemToBasket}>
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {/* Middle/Right: Basket Items & Payment */}
            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Current Cart Items</h3>

                {basketLines.length === 0 ? (
                  <p className="text-sm text-slate-400 py-10 text-center">The basket is empty. Add services or products above.</p>
                ) : (
                  <div className="divide-y divide-slate-100 mt-2">
                    {basketLines.map((line, index) => (
                      <div key={line.id} className="py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{line.description}</p>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {line.sourceType}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-slate-500">
                            {line.quantity} × ${line.unitPrice}
                          </span>
                          <span className="text-sm font-bold text-slate-900 w-20 text-right">
                            ${line.quantity * line.unitPrice}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeBasketLine(index)}
                            className="text-slate-400 hover:text-rose-600 font-bold ml-2"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Basket Total & Checkout Strip */}
              <div className="border-t border-slate-200 pt-4 mt-6">
                <div className="flex justify-between items-center text-lg font-bold text-slate-900">
                  <span>Grand Total</span>
                  <span className="text-2xl text-teal-800">${basketTotal}</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">Payment:</span>
                    <select
                      className="rounded border border-slate-300 p-1.5 text-xs font-semibold"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                      <option value="UPI">UPI / QR Code</option>
                      <option value="CARD">Credit / Debit Card</option>
                      <option value="CASH">Cash at Counter</option>
                    </select>
                  </div>

                  <div className="flex gap-2">
                    {!issuedInvoice ? (
                      <Button
                        id="btn-issue-invoice"
                        size="sm"
                        variant="outline"
                        onClick={() => issueUnifiedInvoiceMutation.mutate()}
                        disabled={issueUnifiedInvoiceMutation.isPending || basketLines.length === 0}
                      >
                        {issueUnifiedInvoiceMutation.isPending ? "Issuing…" : "Issue Official Invoice"}
                      </Button>
                    ) : (
                      <Button
                        id="btn-collect-payment"
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        onClick={() => payUnifiedInvoiceMutation.mutate()}
                        disabled={payUnifiedInvoiceMutation.isPending}
                      >
                        {payUnifiedInvoiceMutation.isPending ? "Recording…" : `Collect $${issuedInvoice.total} (${paymentMethod})`}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: QUICK WALK-IN REGISTRATION                                         */}
      {/* ========================================================================= */}
      {activeTab === "register" && (
        <div className="max-w-2xl mx-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col gap-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Quick Walk-In Registration</h2>
            <p className="text-sm text-slate-500">
              Register new client and pet in seconds and instantly assign a queue token.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">Client / Owner Name *</label>
              <input
                id="reg-client-name"
                type="text"
                placeholder="e.g. John Doe"
                className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm"
                value={regClientName}
                onChange={(e) => setRegClientName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Phone Number *</label>
              <input
                id="reg-client-phone"
                type="text"
                placeholder="e.g. 9876543210"
                className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm"
                value={regClientPhone}
                onChange={(e) => setRegClientPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">Pet Name *</label>
              <input
                id="reg-pet-name"
                type="text"
                placeholder="e.g. Bruno"
                className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm"
                value={regPetName}
                onChange={(e) => setRegPetName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Species</label>
              <select
                id="reg-species-select"
                className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm"
                value={regSpecies}
                onChange={(e) => setRegSpecies(e.target.value)}
              >
                <option value="CANINE">Canine (Dog)</option>
                <option value="FELINE">Feline (Cat)</option>
                <option value="AVIAN">Avian (Bird)</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Breed</label>
              <input
                id="reg-breed-input"
                type="text"
                className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm"
                value={regBreed}
                onChange={(e) => setRegBreed(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Assign Doctor *</label>
            <select
              id="reg-doctor-select"
              className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm"
              value={regDoctorId}
              onChange={(e) => setRegDoctorId(e.target.value)}
            >
              <option value="">Select attending doctor…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName} ({d.roles.join(", ")})
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setActiveTab("queue")}
            >
              Cancel
            </Button>
            <Button
              id="btn-register-walkin"
              className="bg-teal-700 hover:bg-teal-800 text-white"
              onClick={() => executeWalkInRegistration.mutate()}
              disabled={executeWalkInRegistration.isPending || !regClientName || !regPetName || !regDoctorId}
            >
              {executeWalkInRegistration.isPending ? "Registering…" : "Register & Issue Queue Token ✓"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
