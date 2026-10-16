"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Trash2, CheckCircle2, AlertCircle, Printer, Receipt } from "lucide-react";
import {
  listPatients,
  listClients,
  listBranches,
  listUsers,
  listQueue,
  createAppointment,
  createConsultation,
  createPrescription,
  issueInvoice,
  updateQueueStatus,
  currentUser,
  type PatientRow,
  type ClientRow,
} from "@/lib/api";
import { PrintableDocumentModal, type PrescriptionPrintData, type InvoicePrintData } from "@/components/printable-document-modal";

export type PrescriptionItemDraft = {
  id: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions: string;
};

export function RecordSoapModal({
  isOpen,
  onClose,
  initialPatientId,
  initialAppointmentId,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialPatientId?: string;
  initialAppointmentId?: string;
}) {
  const queryClient = useQueryClient();

  // 1. Patient & Charge
  const [patientId, setPatientId] = useState<string>(initialPatientId || "");
  const [charge, setCharge] = useState<string>("50");

  // 2. Symptoms (Subjective)
  const [symptoms, setSymptoms] = useState<string>("");

  // 3. Diagnosis (Assessment)
  const [diagnosis, setDiagnosis] = useState<string>("");

  // 4. Differentials
  const [differentials, setDifferentials] = useState<string>("");

  // 5. Clinical Notes (Objective)
  const [clinicalNotes, setClinicalNotes] = useState<string>("");

  // 6. Vitals
  const [weight, setWeight] = useState<string>("10");
  const [temp, setTemp] = useState<string>("101.5");
  const [heartRate, setHeartRate] = useState<string>("");
  const [respRate, setRespRate] = useState<string>("");

  // 7. Treatment Plan (Plan)
  const [treatmentPlan, setTreatmentPlan] = useState<string>("");

  // 8. Doctor’s Remarks / Note
  const [doctorRemarks, setDoctorRemarks] = useState<string>("");

  // 9. Prescriptions
  const [prescriptions, setPrescriptions] = useState<PrescriptionItemDraft[]>([]);
  const [medName, setMedName] = useState<string>("");
  const [medDosage, setMedDosage] = useState<string>("");
  const [medFrequency, setMedFrequency] = useState<string>("Twice");
  const [medDuration, setMedDuration] = useState<string>("7 days");
  const [medQuantity, setMedQuantity] = useState<string>("1");
  const [medInstructions, setMedInstructions] = useState<string>("With food");

  // Status & feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printDocType, setPrintDocType] = useState<"PRESCRIPTION" | "INVOICE">("PRESCRIPTION");
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string>("");

  const session = useQuery({ queryKey: ["session"], queryFn: currentUser, enabled: isOpen });

  // Queries
  const patientsQuery = useQuery<PatientRow[]>({
    queryKey: ["patients"],
    queryFn: () => listPatients(),
    enabled: isOpen,
  });

  const clientsQuery = useQuery<ClientRow[]>({
    queryKey: ["clients"],
    queryFn: listClients,
    enabled: isOpen,
  });

  const branchesQuery = useQuery({
    queryKey: ["branches"],
    queryFn: () => listBranches(),
    enabled: isOpen,
  });

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
    enabled: isOpen,
  });

  const branchId = branchesQuery.data?.items?.[0]?.id || "";
  const queueQuery = useQuery({
    queryKey: ["queue", branchId],
    queryFn: () => listQueue(branchId),
    enabled: isOpen && Boolean(branchId),
  });

  useEffect(() => {
    if (initialPatientId) {
      setPatientId(initialPatientId);
    }
  }, [initialPatientId]);

  const addPrescription = () => {
    if (!medName.trim()) return;
    const newItem: PrescriptionItemDraft = {
      id: "rx_" + Date.now(),
      medicineName: medName.trim(),
      dosage: medDosage.trim() || "As directed",
      frequency: medFrequency,
      duration: medDuration,
      quantity: Math.max(1, Number(medQuantity) || 1),
      instructions: medInstructions,
    };
    setPrescriptions((prev) => [...prev, newItem]);
    setMedName("");
    setMedDosage("");
    setMedQuantity("1");
  };

  const removePrescription = (id: string) => {
    setPrescriptions((prev) => prev.filter((p) => p.id !== id));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!patientId) {
        throw new Error("Please select a patient.");
      }

      const selectedPatient = patientsQuery.data?.find((p) => p.id === patientId);
      const activeBranchId = branchId || branchesQuery.data?.items?.[0]?.id;
      if (!activeBranchId) {
        throw new Error("No active clinic branch available.");
      }

      // Check if patient has an active appointment in queue
      const existingQueueEntry = queueQuery.data?.find(
        (q) => q.patientId === patientId && (q.status === "WAITING" || q.status === "IN_CONSULTATION")
      );

      let apptId = initialAppointmentId || existingQueueEntry?.appointmentId;

      // If no appointment exists, create a walk-in appointment automatically
      if (!apptId) {
        const defaultDoctor = usersQuery.data?.items?.find(
          (u) => u.roles.includes("DOCTOR") || u.roles.includes("OWNER")
        );
        const doctorUserId = defaultDoctor?.id || usersQuery.data?.items?.[0]?.id;
        if (!doctorUserId) {
          throw new Error("No doctor user found to record consultation.");
        }

        const now = new Date();
        const end = new Date(now.getTime() + 30 * 60 * 1000);
        const newAppt = await createAppointment({
          branchId: activeBranchId,
          patientId,
          clientId: selectedPatient?.clientId,
          doctorUserId,
          startsAt: now.toISOString(),
          endsAt: end.toISOString(),
          status: "CHECKED_IN",
          notes: "Walk-in SOAP Consultation",
        });
        apptId = newAppt.id;
      }

      // Format vitals & examination
      const vitalsText = `Vitals: Weight: ${weight}kg | Temp: ${temp}°F | HR: ${heartRate || "N/A"} | RR: ${respRate || "N/A"}`;
      const fullExam = clinicalNotes ? `${vitalsText}\n\nClinical Observations:\n${clinicalNotes}` : vitalsText;

      // Format differentials list
      const diffList = differentials
        ? differentials
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean)
            .map((label, idx) => ({
              label,
              rank: idx + 1,
              notes: "Differential diagnosis",
            }))
        : [];

      // 1. Create Consultation
      const consult = await createConsultation({
        appointmentId: apptId,
        subjective: symptoms || "Routine SOAP exam",
        history: `Vitals recorded: Weight ${weight}kg, Temp ${temp}°F`,
        examination: fullExam,
        assessment: diagnosis || "General Examination",
        plan: treatmentPlan || "Standard supportive care",
        diagnosis: diagnosis || "Clinical Consultation",
        doctorRemarks: doctorRemarks || "Advice provided to owner",
        doctorNotes: doctorRemarks || "None",
        differentials: diffList,
      });

      // 2. Create Prescription if any
      if (prescriptions.length > 0) {
        await createPrescription({
          consultationId: consult.id,
          notes: "Dispensed via SOAP Consultation Station",
          items: prescriptions.map((p) => ({
            medicineName: p.medicineName,
            quantity: p.quantity,
            dosage: p.dosage,
            frequency: p.frequency,
            duration: p.duration,
            route: "Oral",
            instructions: p.instructions,
          })),
        });
      }

      // 3. Auto-bill consultation & medications to Invoice Basket
      const invoiceLines = [
        {
          description: `Consultation (${diagnosis || "General Clinical Examination"})`,
          quantity: 1,
          unitPrice: Math.max(0, Number(charge) || 50),
          sourceType: "SERVICE",
        },
        ...prescriptions.map((rx) => ({
          description: `Rx: ${rx.medicineName} (${rx.dosage}, ${rx.frequency})`,
          quantity: rx.quantity,
          unitPrice: 15.0,
          sourceType: "PRESCRIPTION",
        })),
      ];

      const createdInv = await issueInvoice({
        patientId,
        clientId: selectedPatient?.clientId,
        branchId: activeBranchId,
        lines: invoiceLines,
      });
      if (createdInv?.id) {
        setCreatedInvoiceId(createdInv.id);
      }

      // 4. Mark queue entry completed if active
      if (existingQueueEntry?.id) {
        await updateQueueStatus(existingQueueEntry.id, "COMPLETED");
      }

      return consult;
    },
    onSuccess: () => {
      setSuccessInfo("SOAP Consultation recorded and auto-billed to Invoice Basket successfully!");
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["patient-timeline"] });
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || "Failed to save SOAP consultation.");
    },
  });

  if (!isOpen) return null;

  const resetAndClose = () => {
    setPatientId(initialPatientId || "");
    setCharge("50");
    setSymptoms("");
    setDiagnosis("");
    setDifferentials("");
    setClinicalNotes("");
    setTreatmentPlan("");
    setDoctorRemarks("");
    setPrescriptions([]);
    setErrorMessage(null);
    setSuccessInfo(null);
    setCreatedInvoiceId("");
    onClose();
  };

  const selectedPatient = patientsQuery.data?.find((p) => p.id === patientId);
  const matchingClient = selectedPatient
    ? clientsQuery.data?.find((c) => c.id === selectedPatient.clientId)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="relative my-8 w-full max-w-2xl rounded-2xl bg-white p-6 sm:p-7 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Record SOAP Consultation</h2>
          <button
            onClick={resetAndClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {successInfo ? (
          <div className="my-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Consultation Saved!</h3>
              <p className="text-sm text-slate-600 mt-1">{successInfo}</p>
              <p className="text-xs text-teal-700 mt-1 font-semibold">
                Auto-Billed: Consultation (${Number(charge).toFixed(2)}) + {prescriptions.length} Meds
              </p>
            </div>

            {/* Print and Done buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-3">
              <button
                type="button"
                onClick={() => {
                  setPrintDocType("PRESCRIPTION");
                  setPrintModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-900 hover:bg-teal-100 transition shadow-2xs"
              >
                <Printer className="h-4 w-4 text-teal-700" />
                Print Prescription Slip (Rx)
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrintDocType("INVOICE");
                  setPrintModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition shadow-2xs"
              >
                <Receipt className="h-4 w-4 text-slate-700" />
                Print Tax Invoice
              </button>
              <button
                type="button"
                onClick={resetAndClose}
                className="rounded-xl bg-[#0D7A75] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0B6864] transition shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 1. ROW 1: PATIENT + CHARGE ($) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Patient
                </label>
                <select
                  value={patientId}
                  onChange={(e) => {
                    setPatientId(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-teal-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 transition"
                >
                  <option value="">Select patient...</option>
                  {patientsQuery.data?.map((p) => {
                    const client = clientsQuery.data?.find((c) => c.id === p.clientId);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.speciesCode} - {p.sizeCategory}) — Owner: {client?.displayName || "Unknown"}
                      </option>
                    );
                  })}
                </select>
                {matchingClient && (
                  <p className="mt-1 text-[11px] text-teal-700 flex items-center gap-1.5 flex-wrap">
                    <span>Owner: {matchingClient.displayName} ({matchingClient.phone || "No phone"})</span>
                    {matchingClient.category === "LOYAL" && (
                      <span className="rounded bg-amber-100 border border-amber-300 text-amber-900 px-1.5 py-0.2 text-[10px] font-bold">
                        ⭐ Loyal Client
                      </span>
                    )}
                    {matchingClient.category === "NGO" && (
                      <span className="rounded bg-emerald-100 border border-emerald-300 text-emerald-900 px-1.5 py-0.2 text-[10px] font-bold">
                        🐾 NGO / Stray Rescue (50% Consultation Eligible)
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Charge ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={charge}
                  onChange={(e) => setCharge(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-teal-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 transition"
                />
              </div>
            </div>

            {/* 2. SYMPTOMS (SUBJECTIVE) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Symptoms (Subjective)
              </label>
              <textarea
                rows={2}
                placeholder="Pruritus, red paws, licking..."
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-teal-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 placeholder-slate-400 transition"
              />
            </div>

            {/* 3. DIAGNOSIS (ASSESSMENT) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Diagnosis (Assessment)
              </label>
              <input
                type="text"
                placeholder="e.g. Atopic Dermatitis"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-teal-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 placeholder-slate-400 transition"
              />
            </div>

            {/* 4. DIFFERENTIALS */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Differentials
              </label>
              <input
                type="text"
                placeholder="e.g. Flea Allergy Dermatitis, Food Allergy, Contact Dermatitis"
                value={differentials}
                onChange={(e) => setDifferentials(e.target.value)}
                className="w-full rounded-xl border border-teal-300 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-teal-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 placeholder-slate-400 transition"
              />
            </div>

            {/* 5. CLINICAL NOTES (OBJECTIVE) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Clinical Notes (Objective)
              </label>
              <textarea
                rows={2}
                placeholder="Physical exam findings..."
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-teal-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 placeholder-slate-400 transition"
              />
            </div>

            {/* 6. VITALS ROW (4 COLS) */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Weight (kg)
                </label>
                <input
                  type="text"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 shadow-2xs focus:border-teal-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Temp (°F)
                </label>
                <input
                  type="text"
                  value={temp}
                  onChange={(e) => setTemp(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 shadow-2xs focus:border-teal-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Heart Rate
                </label>
                <input
                  type="text"
                  placeholder="90 bpm"
                  value={heartRate}
                  onChange={(e) => setHeartRate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 shadow-2xs focus:border-teal-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 placeholder-slate-400 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Resp Rate
                </label>
                <input
                  type="text"
                  placeholder="22 rpm"
                  value={respRate}
                  onChange={(e) => setRespRate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900 shadow-2xs focus:border-teal-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 placeholder-slate-400 transition"
                />
              </div>
            </div>

            {/* 7. TREATMENT PLAN (PLAN) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Treatment Plan (Plan)
              </label>
              <input
                type="text"
                placeholder="Medicated bath, anti-itch oral meds..."
                value={treatmentPlan}
                onChange={(e) => setTreatmentPlan(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-teal-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 placeholder-slate-400 transition"
              />
            </div>

            {/* 8. DOCTOR'S REMARKS / NOTE */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Doctor’s Remarks / Note
              </label>
              <textarea
                rows={2}
                placeholder="Advice to the owner, cautions, follow-up instructions..."
                value={doctorRemarks}
                onChange={(e) => setDoctorRemarks(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 shadow-2xs focus:border-teal-500 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-teal-500 placeholder-slate-400 transition"
              />
            </div>

            {/* 9. PRESCRIPTIONS CARD */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Prescriptions</span>
                <span className="text-xs text-slate-400">{prescriptions.length} medicines</span>
              </div>

              {/* Form inputs in single inline flex row */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    placeholder="Medicine"
                    value={medName}
                    onChange={(e) => setMedName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="Dosage"
                    value={medDosage}
                    onChange={(e) => setMedDosage(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <select
                    value={medFrequency}
                    onChange={(e) => setMedFrequency(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-hidden"
                  >
                    <option value="Once">Once</option>
                    <option value="Twice">Twice</option>
                    <option value="Thrice">Thrice</option>
                    <option value="As needed">As needed</option>
                  </select>
                </div>

                <div>
                  <select
                    value={medDuration}
                    onChange={(e) => setMedDuration(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-hidden"
                  >
                    <option value="3 days">3 days</option>
                    <option value="5 days">5 days</option>
                    <option value="7 days">7 days</option>
                    <option value="10 days">10 days</option>
                    <option value="14 days">14 days</option>
                  </select>
                </div>

                <div>
                  <select
                    value={medInstructions}
                    onChange={(e) => setMedInstructions(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-xs text-slate-900 focus:border-teal-500 focus:outline-hidden"
                  >
                    <option value="With food">With food</option>
                    <option value="After food">After food</option>
                    <option value="Before food">Before food</option>
                    <option value="As directed">As directed</option>
                  </select>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={addPrescription}
                    className="w-full rounded-lg bg-[#0D7A75] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B6864] transition shadow-2xs"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Added prescriptions pills/list */}
              {prescriptions.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {prescriptions.map((rx) => (
                    <div
                      key={rx.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{rx.medicineName}</span>
                        <span className="text-slate-500">
                          ({rx.dosage} • {rx.frequency} • {rx.duration} • {rx.instructions})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePrescription(rx.id)}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 10. AUTO-BILLED AS */}
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-500 font-medium">Auto-Billed as</span>
              <span className="font-semibold text-slate-800">
                Consultation — ${Number(charge).toFixed(2)} — Invoice Basket
              </span>
            </div>

            {/* 11. FOOTER BUTTONS: CANCEL + SAVE CONSULTATION */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={resetAndClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saveMutation.isPending || !patientId}
                onClick={() => saveMutation.mutate()}
                className="rounded-xl bg-[#0D7A75] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0B6864] disabled:opacity-50 transition shadow-sm"
              >
                {saveMutation.isPending ? "Saving Consultation…" : "Save Consultation"}
              </button>
            </div>
          </div>
        )}
      </div>

      <PrintableDocumentModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        documentType={printDocType}
        prescriptionData={{
          prescriptionDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
          doctorName: session.data?.displayName || "Dr. Alex Smith, BVSc",
          clientName: matchingClient?.displayName || "Pet Parent",
          clientPhone: matchingClient?.phone || "",
          petName: selectedPatient?.name || "Patient",
          petSpecies: selectedPatient?.speciesCode,
          petBreed: selectedPatient?.sizeCategory,
          petWeight: weight,
          vitals: `Temp: ${temp}°F | HR: ${heartRate || "Normal"} | RR: ${respRate || "Normal"}`,
          symptoms: symptoms,
          diagnosis: diagnosis,
          doctorRemarks: doctorRemarks,
          items: prescriptions.map((p) => ({
            medicineName: p.medicineName,
            dosage: p.dosage,
            frequency: p.frequency,
            duration: p.duration,
            instructions: p.instructions,
            quantity: p.quantity,
          })),
        }}
        invoiceData={{
          invoiceNumber: createdInvoiceId || "INV-" + Date.now().toString().slice(-6),
          invoiceDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
          clientName: matchingClient?.displayName || "Pet Parent",
          clientPhone: matchingClient?.phone || "",
          petName: selectedPatient?.name,
          lines: [
            {
              description: `Consultation (${diagnosis || "Clinical Examination"})`,
              quantity: 1,
              unitPrice: Math.max(0, Number(charge) || 50),
              total: Math.max(0, Number(charge) || 50),
            },
            ...prescriptions.map((rx) => ({
              description: `Rx: ${rx.medicineName} (${rx.dosage})`,
              quantity: rx.quantity,
              unitPrice: 15.0,
              total: rx.quantity * 15.0,
            })),
          ],
          subtotal: Math.max(0, Number(charge) || 50) + prescriptions.reduce((acc, p) => acc + p.quantity * 15.0, 0),
          taxAmount: 0,
          grandTotal: Math.max(0, Number(charge) || 50) + prescriptions.reduce((acc, p) => acc + p.quantity * 15.0, 0),
          paymentStatus: "PENDING",
        }}
      />
    </div>
  );
}
