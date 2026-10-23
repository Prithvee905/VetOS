"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useTransition, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  listPatients,
  listClients,
  createClient,
  createPatient,
  getPatientTimeline,
  recordDeworming,
  recordVaccination,
  createLabOrder,
  listUsers,
  listBranches,
  createAppointment,
  checkInQueue,
  listQueue,
  type PatientRow,
  type ClientRow,
  type PatientTimeline,
  currentUser,
  copilotAdvise,
  getInvoice,
  getPrescription,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { RecordSoapModal } from "@/components/record-soap-modal";
import { VaccineSchedulePanel } from "@/components/vaccine-schedule-panel";
import { Paperclip, Printer, FileText, Search, User } from "lucide-react";
import { FileAttachmentsModal } from "@/components/file-attachments-modal";
import { PrintableDocumentModal, type PrescriptionPrintData, type InvoicePrintData } from "@/components/printable-document-modal";
import { PatientHealthProfileModal } from "@/components/patient-health-profile-modal";

export default function PatientsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const initialPatientId = searchParams.get("selected");
  const [soapModalOpen, setSoapModalOpen] = useState(false);

  const session = useQuery({ queryKey: ["session"], queryFn: currentUser });
  const isDoctorOrOwner = session.data?.roles.some((r) => ["OWNER", "DOCTOR"].includes(r)) ?? false;

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(initialPatientId);
  const [copilotTips, setCopilotTips] = useState<string[] | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [showNewOwnerModal, setShowNewOwnerModal] = useState(false);
  const [showNewPetModal, setShowNewPetModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState<"DEWORMING" | "VACCINATION" | "LAB" | null>(null);
  const [patientFilesOpen, setPatientFilesOpen] = useState(false);
  const [healthProfileOpen, setHealthProfileOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printDocType, setPrintDocType] = useState<"PRESCRIPTION" | "INVOICE">("PRESCRIPTION");
  const [activePrintData, setActivePrintData] = useState<{
    prescription?: PrescriptionPrintData;
    invoice?: InvoicePrintData;
    invoiceId?: string;
  }>({});
  const [invoiceLoadingId, setInvoiceLoadingId] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  async function openPrescriptionPrint(prescriptionId: string) {
    setInvoiceLoadingId(prescriptionId);
    setInvoiceError(null);
    try {
      const rx = await getPrescription(prescriptionId);
      const events = timelineQuery.data?.events ?? [];
      const consultation = events.find((e) => e.id === rx.consultationId);
      const prescribedAt = events.find((e) => e.id === rx.id)?.timestamp;
      const doctor = usersQuery.data?.items.find((u) => u.id === rx.doctorUserId);
      setPrintDocType("PRESCRIPTION");
      setActivePrintData({
        prescription: {
          prescriptionDate: new Date(prescribedAt ?? Date.now()).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }),
          doctorName: doctor?.displayName || "",
          clientName: timelineQuery.data?.client.displayName || "Pet Parent",
          clientPhone: timelineQuery.data?.client.phone || "",
          petName: timelineQuery.data?.patient.name || "Patient",
          petSpecies: timelineQuery.data?.patient.speciesCode,
          petBreed: timelineQuery.data?.patient.breed || undefined,
          diagnosis: consultation?.title,
          symptoms: consultation?.subtitle,
          items: rx.items.map((item) => ({
            medicineName: item.medicineName,
            dosage: item.dosage || undefined,
            frequency: item.frequency || undefined,
            duration: item.duration || undefined,
            instructions: item.instructions || undefined,
            quantity: Number(item.quantity) || undefined,
          })),
        },
      });
      setPrintModalOpen(true);
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : "Could not load this prescription.");
    } finally {
      setInvoiceLoadingId(null);
    }
  }

  async function openInvoicePrint(invoiceId: string) {
    setInvoiceLoadingId(invoiceId);
    setInvoiceError(null);
    try {
      const invoice = await getInvoice(invoiceId);
      const paid = Number(invoice.amountPaid) || 0;
      const total = Number(invoice.total) || 0;
      setPrintDocType("INVOICE");
      setActivePrintData({
        invoiceId: invoice.id,
        invoice: {
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: new Date(invoice.issuedAt).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }),
          currencyCode: invoice.currencyCode,
          clientName: timelineQuery.data?.client.displayName || "Pet Parent",
          clientPhone: timelineQuery.data?.client.phone || "",
          petName: timelineQuery.data?.patient.name,
          lines: invoice.lines.map((line) => ({
            description: line.description,
            quantity: Number(line.quantity) || 0,
            unitPrice: Number(line.unitPrice) || 0,
            total: Number(line.lineTotal) || 0,
            hsnSac: line.hsnSac || undefined,
            taxRate: Number(line.taxRate ?? 0) || 0,
          })),
          subtotal: Number(invoice.subtotal) || 0,
          taxAmount: Number(invoice.taxTotal) || 0,
          grandTotal: total,
          paymentStatus: paid >= total && total > 0 ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING",
        },
      });
      setPrintModalOpen(true);
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : "Could not load this invoice.");
    } finally {
      setInvoiceLoadingId(null);
    }
  }
  const [chronologySearch, setChronologySearch] = useState("");
  const [chronologyTypeFilter, setChronologyTypeFilter] = useState("ALL");

  // New Owner Form State
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  // New Pet Form State
  const [petClientId, setPetClientId] = useState("");
  const [petName, setPetName] = useState("");
  const [petSpecies, setPetSpecies] = useState("CANINE");
  const [petBreed, setPetBreed] = useState("");
  const [petSize, setPetSize] = useState("MEDIUM");

  // Action modal states
  const [dewormProduct, setDewormProduct] = useState("");
  const [dewormAdminDate, setDewormAdminDate] = useState(new Date().toISOString().slice(0, 10));
  const [dewormNextDate, setDewormNextDate] = useState("");
  const [vaxName, setVaxName] = useState("");
  const [vaxAdminDate, setVaxAdminDate] = useState(new Date().toISOString().slice(0, 10));
  const [vaxNextDate, setVaxNextDate] = useState("");
  const [vaxBatch, setVaxBatch] = useState("");
  const [vaxNotes, setVaxNotes] = useState("");
  const [labTestName, setLabTestName] = useState("");

  const [isPending, startTransition] = useTransition();

  // Queries
  const patientsQuery = useQuery<PatientRow[]>({
    queryKey: ["patients"],
    queryFn: () => listPatients(),
  });

  const clientsQuery = useQuery<ClientRow[]>({
    queryKey: ["clients"],
    queryFn: listClients,
  });

  const timelineQuery = useQuery<PatientTimeline>({
    queryKey: ["patient-timeline", selectedPatientId],
    queryFn: () => getPatientTimeline(selectedPatientId!),
    enabled: !!selectedPatientId,
  });

  const filteredChronologyEvents = useMemo(() => {
    const events = timelineQuery.data?.events ?? [];
    return events.filter((ev) => {
      if (chronologyTypeFilter !== "ALL" && ev.eventType !== chronologyTypeFilter) {
        return false;
      }
      if (!chronologySearch.trim()) return true;
      const q = chronologySearch.toLowerCase().trim();
      const titleMatch = ev.title?.toLowerCase().includes(q);
      const subtitleMatch = ev.subtitle?.toLowerCase().includes(q);
      const typeMatch = ev.eventType?.toLowerCase().includes(q);
      const statusMatch = ev.status?.toLowerCase().includes(q);
      const dateMatch = new Date(ev.timestamp).toLocaleString().toLowerCase().includes(q);
      return Boolean(titleMatch || subtitleMatch || typeMatch || statusMatch || dateMatch);
    });
  }, [timelineQuery.data?.events, chronologyTypeFilter, chronologySearch]);

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
  });

  const branchesQuery = useQuery({
    queryKey: ["branches"],
    queryFn: () => listBranches(),
  });

  const activeBranchId = branchesQuery.data?.items[0]?.id;
  const queueQuery = useQuery({
    queryKey: ["queue", activeBranchId],
    queryFn: () => listQueue(activeBranchId!),
    enabled: Boolean(activeBranchId),
    refetchInterval: 6_000,
  });

  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [checkInDoctorId, setCheckInDoctorId] = useState("");
  const [checkInPriority, setCheckInPriority] = useState<"NORMAL" | "HIGH" | "EMERGENCY">("NORMAL");
  const [checkInSuccessMsg, setCheckInSuccessMsg] = useState<string | null>(null);

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatientId) throw new Error("No patient selected");
      if (!checkInDoctorId) throw new Error("Please select an attending doctor");
      const branchId = branchesQuery.data?.items[0]?.id;
      if (!branchId) throw new Error("No active clinic branch found");

      const now = new Date();
      const end = new Date(now.getTime() + 30 * 60 * 1000);
      const appt = await createAppointment({
        branchId,
        patientId: selectedPatientId,
        doctorUserId: checkInDoctorId,
        startsAt: now.toISOString(),
        endsAt: end.toISOString(),
        notes: "Checked in from Patient Records",
      });

      const qEntry = await checkInQueue(appt.id);
      return { token: qEntry.tokenNumber };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setCheckInSuccessMsg(`Checked in successfully! Assigned Live Queue Token #${data.token}`);
      setShowCheckInModal(false);
      setTimeout(() => setCheckInSuccessMsg(null), 8000);
    },
  });

  // Mutations
  const createOwnerMutation = useMutation({
    mutationFn: () =>
      createClient({
        displayName: ownerName,
        phone: ownerPhone || undefined,
        email: ownerEmail || undefined,
      }),
    onSuccess: (newOwner) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setPetClientId(newOwner.id);
      setShowNewOwnerModal(false);
      setOwnerName("");
      setOwnerPhone("");
      setOwnerEmail("");
    },
  });

  const createPetMutation = useMutation({
    mutationFn: () =>
      createPatient({
        clientId: petClientId,
        name: petName,
        speciesCode: petSpecies,
        breed: petBreed || "Mixed",
        sizeCategory: petSize,
      }),
    onSuccess: (newPet) => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setSelectedPatientId(newPet.id);
      setShowNewPetModal(false);
      setPetName("");
      setPetBreed("");
    },
  });

  const dewormMutation = useMutation({
    mutationFn: () =>
      recordDeworming({
        patientId: selectedPatientId!,
        productName: dewormProduct,
        administeredOn: dewormAdminDate,
        nextDueOn: dewormNextDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-timeline", selectedPatientId] });
      setShowActionModal(null);
      setDewormProduct("");
    },
  });

  const vaxMutation = useMutation({
    mutationFn: () =>
      recordVaccination({
        patientId: selectedPatientId!,
        vaccineName: vaxName,
        administeredOn: vaxAdminDate,
        nextDueOn: vaxNextDate || undefined,
        batchNumber: vaxBatch || undefined,
        notes: vaxNotes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-timeline", selectedPatientId] });
      queryClient.invalidateQueries({ queryKey: ["vaccine-schedule", selectedPatientId] });
      setShowActionModal(null);
      setVaxName("");
      setVaxBatch("");
      setVaxNotes("");
    },
  });

  const labMutation = useMutation({
    mutationFn: () =>
      createLabOrder({
        patientId: selectedPatientId!,
        testName: labTestName,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-timeline", selectedPatientId] });
      setShowActionModal(null);
      setLabTestName("");
    },
  });

  const filteredPatients = (patientsQuery.data || []).filter((p) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase().trim();
    const client = (clientsQuery.data || []).find((c) => c.id === p.clientId);
    const ownerNameMatch = client?.displayName?.toLowerCase().includes(q);
    const ownerPhoneMatch = client?.phone?.toLowerCase().includes(q);
    return (
      p.name.toLowerCase().includes(q) ||
      p.speciesCode.toLowerCase().includes(q) ||
      Boolean(ownerNameMatch) ||
      Boolean(ownerPhoneMatch)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Patients & Clinical Records</h2>
          <p className="text-xs text-slate-500">Comprehensive medical timeline, vaccinations, and procedures</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowNewOwnerModal(true)}
          >
            + Register Owner
          </Button>
          <Button
            type="button"
            className="bg-teal-800 text-white hover:bg-teal-900"
            size="sm"
            onClick={() => setShowNewPetModal(true)}
          >
            + Register Pet
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Patient List */}
        <div className="lg:col-span-4 space-y-3">
          <input
            type="text"
            placeholder="Filter pets by name, species, or owner…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs shadow-sm focus:border-teal-600 focus:outline-none"
          />

          <div className="max-h-[600px] overflow-y-auto space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            {patientsQuery.isLoading ? (
              <p className="text-xs text-slate-500 p-3">Loading directory…</p>
            ) : filteredPatients.length === 0 ? (
              <p className="text-xs text-slate-400 p-4 text-center">No patients found. Click "+ Register Pet" to add one.</p>
            ) : (
              filteredPatients.map((p) => {
                const active = selectedPatientId === p.id;
                const client = clientsQuery.data?.find((c) => c.id === p.clientId);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPatientId(p.id);
                      setChronologySearch("");
                      setChronologyTypeFilter("ALL");
                    }}
                    className={`w-full text-left rounded-lg p-3 transition border ${
                      active
                        ? "bg-teal-50 border-teal-500 shadow-sm ring-1 ring-teal-500"
                        : "border-slate-100 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">{p.name}</p>
                      <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800 uppercase">
                        {p.speciesCode}
                      </span>
                    </div>

                    {/* Owner / Client Name */}
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700 flex items-center gap-1 truncate max-w-[190px]" title={client?.displayName}>
                        <span className="text-slate-400 font-normal">Owner:</span> {client?.displayName || "Unknown Owner"}
                      </span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {p.sizeCategory}
                      </span>
                    </div>

                    {client?.phone && (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        📞 {client.phone}
                      </p>
                    )}

                    {client?.category === "LOYAL" && (
                      <div className="mt-1.5">
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 text-amber-800 px-1.5 py-0.5 text-[10px] font-bold">
                          ⭐ Loyal Client
                        </span>
                      </div>
                    )}
                    {client?.category === "NGO" && (
                      <div className="mt-1.5">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 px-1.5 py-0.5 text-[10px] font-bold">
                          🐾 NGO Rescue
                        </span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Medical History Timeline */}
        <div className="lg:col-span-8">
          {!selectedPatientId ? (
            <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <span className="text-3xl">🐾</span>
              <p className="mt-2 text-sm font-semibold text-slate-700">Select a pet from the directory</p>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                View their full medical history, SOAP consultations, prescriptions, vaccinations, and lab tests in one chronological timeline.
              </p>
            </div>
          ) : timelineQuery.isLoading ? (
            <div className="flex h-96 items-center justify-center rounded-xl border border-slate-200 bg-white p-6">
              <p className="text-sm text-slate-500 animate-pulse">Loading medical record timeline…</p>
            </div>
          ) : !timelineQuery.data ? (
            <p className="text-sm text-rose-600">Failed to load patient timeline.</p>
          ) : (
            <div className="space-y-4">
              {checkInSuccessMsg && (
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">✓ Success:</span>
                    <span>{checkInSuccessMsg}</span>
                  </div>
                  <a
                    href="/clinic"
                    className="font-bold text-teal-800 underline hover:text-teal-950 text-xs"
                  >
                    View in Live Queue →
                  </a>
                </div>
              )}

              {copilotTips && copilotTips.length > 0 && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-3 text-xs text-indigo-900">
                  <p className="font-bold mb-1">VetOS Copilot (advisory)</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {copilotTips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Patient Banner */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-extrabold text-slate-900">{timelineQuery.data.patient.name}</h3>
                      <span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800 uppercase">
                        {timelineQuery.data.patient.speciesCode}
                      </span>
                      <button
                        type="button"
                        onClick={() => setHealthProfileOpen(true)}
                        className="rounded-full bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 px-2.5 py-0.5 text-[11px] font-bold flex items-center gap-1 transition shadow-2xs cursor-pointer"
                        title="View Health Profile"
                      >
                        <User className="h-3 w-3 text-teal-700" /> Profile
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                      <span>Owner: <span className="font-semibold text-slate-800">{timelineQuery.data.client.displayName}</span> • Phone: {timelineQuery.data.client.phone || "N/A"}</span>
                      {timelineQuery.data.client.category === "LOYAL" && (
                        <span className="rounded bg-amber-100 border border-amber-300 text-amber-900 px-1.5 py-0.5 text-[10px] font-bold">
                          ⭐ Loyal Client
                        </span>
                      )}
                      {timelineQuery.data.client.category === "NGO" && (
                        <span className="rounded bg-emerald-100 border border-emerald-300 text-emerald-900 px-1.5 py-0.5 text-[10px] font-bold">
                          🐾 NGO Rescue
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="bg-emerald-600 text-white hover:bg-emerald-700 font-bold shadow-sm"
                      onClick={() => {
                        const defaultDoc = usersQuery.data?.items.find((u) => u.roles.includes("DOCTOR") || u.roles.includes("OWNER"));
                        if (defaultDoc && !checkInDoctorId) setCheckInDoctorId(defaultDoc.id);
                        setShowCheckInModal(true);
                      }}
                    >
                      ⚡ Check into Queue
                    </Button>
                    {isDoctorOrOwner && selectedPatientId && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const res = await copilotAdvise(selectedPatientId);
                          setCopilotTips(res.suggestions);
                        }}
                      >
                        Copilot advise
                      </Button>
                    )}
                    {isDoctorOrOwner && (
                      <Button
                        type="button"
                        size="sm"
                        className="bg-teal-700 text-white hover:bg-teal-800"
                        onClick={() => setSoapModalOpen(true)}
                      >
                        + Record SOAP Consult
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowActionModal("VACCINATION")}
                    >
                      + Record Vaccine
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowActionModal("DEWORMING")}
                    >
                      + Deworming
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowActionModal("LAB")}
                    >
                      + Order Lab
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setHealthProfileOpen(true)}
                      className="flex items-center gap-1.5 border-teal-300 text-teal-800 bg-teal-50/70 hover:bg-teal-100 font-semibold"
                    >
                      <User className="h-3.5 w-3.5 text-teal-700" />
                      Health Profile
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPatientFilesOpen(true)}
                      className="flex items-center gap-1.5 border-purple-200 text-purple-800 bg-purple-50/50 hover:bg-purple-100"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      Documents & Scans
                    </Button>
                  </div>
                </div>
              </div>

              {selectedPatientId && <VaccineSchedulePanel patientId={selectedPatientId} canEdit={isDoctorOrOwner} />}

              {/* Timeline Items */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                      Medical Record Chronology
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {chronologySearch || chronologyTypeFilter !== "ALL"
                        ? `Showing ${filteredChronologyEvents.length} of ${timelineQuery.data.events.length} historical events`
                        : `${timelineQuery.data.events.length} total events in patient history`}
                    </p>
                  </div>

                  {/* Search Input for Chronology */}
                  <div className="relative w-full sm:w-80">
                    <input
                      id="input-search-chronology"
                      type="text"
                      placeholder="Search diagnoses, meds, surgeries, labs…"
                      value={chronologySearch}
                      onChange={(e) => setChronologySearch(e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white pl-8 pr-7 py-1.5 text-xs text-slate-800 shadow-xs focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                    />
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    {chronologySearch && (
                      <button
                        type="button"
                        onClick={() => setChronologySearch("")}
                        className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                        title="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Event-Type Filter Badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1">Filter Type:</span>
                  {[
                    { label: "All Events", value: "ALL" },
                    { label: "🩺 Consultations", value: "CONSULTATION" },
                    { label: "💊 Prescriptions", value: "PRESCRIPTION" },
                    { label: "✂️ Surgeries", value: "SURGERY" },
                    { label: "💉 Vaccinations", value: "VACCINATION" },
                    { label: "🧪 Labs", value: "LAB" },
                    { label: "🪱 Deworming", value: "DEWORMING" },
                    { label: "🧾 Invoices", value: "INVOICE" },
                  ].map((tab) => {
                    const count = tab.value === "ALL"
                      ? timelineQuery.data.events.length
                      : timelineQuery.data.events.filter((e) => e.eventType === tab.value).length;
                    if (tab.value !== "ALL" && count === 0) return null;
                    const isSelected = chronologyTypeFilter === tab.value;
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setChronologyTypeFilter(tab.value)}
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                          isSelected
                            ? "bg-teal-700 text-white border-teal-800 shadow-2xs"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {tab.label} ({count})
                      </button>
                    );
                  })}
                  {(chronologySearch || chronologyTypeFilter !== "ALL") && (
                    <button
                      type="button"
                      onClick={() => {
                        setChronologySearch("");
                        setChronologyTypeFilter("ALL");
                      }}
                      className="text-[11px] text-teal-700 hover:text-teal-900 underline ml-2 font-medium"
                    >
                      Reset filters
                    </button>
                  )}
                </div>

                {timelineQuery.data.events.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">
                    No clinical history recorded yet for this patient.
                  </p>
                ) : filteredChronologyEvents.length === 0 ? (
                  <div className="py-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    <p className="text-xs font-semibold text-slate-600">
                      No clinical events matching &ldquo;{chronologySearch}&rdquo;
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setChronologySearch("");
                        setChronologyTypeFilter("ALL");
                      }}
                      className="mt-2 text-xs text-teal-700 hover:underline font-bold"
                    >
                      Clear search & filters
                    </button>
                  </div>
                ) : (
                  <div className="relative border-l-2 border-teal-100 ml-3 space-y-6 pt-1">
                    {filteredChronologyEvents.map((ev) => {
                      const colorMap: Record<string, string> = {
                        CONSULTATION: "bg-teal-600",
                        PRESCRIPTION: "bg-blue-600",
                        VACCINATION: "bg-emerald-600",
                        DEWORMING: "bg-amber-600",
                        LAB: "bg-purple-600",
                        SURGERY: "bg-rose-600",
                        ADMISSION: "bg-indigo-600",
                        INVOICE: "bg-slate-600",
                        APPOINTMENT: "bg-slate-400",
                      };
                      const dotColor = colorMap[ev.eventType] || "bg-teal-600";

                      return (
                        <div key={ev.id} className="relative pl-6">
                          <span
                            className={`absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-white ${dotColor}`}
                          />
                          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 shadow-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase text-slate-500">{ev.eventType}</span>
                              <span className="text-[11px] text-slate-400">
                                {new Date(ev.timestamp).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm font-bold text-slate-900 mt-1">{ev.title}</p>
                            {ev.subtitle && (
                              <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">{ev.subtitle}</p>
                            )}
                            <div className="mt-2.5 flex items-center justify-between">
                              <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                                Status: {ev.status}
                              </span>
                              {ev.eventType === "PRESCRIPTION" && (
                                <button
                                  type="button"
                                  disabled={invoiceLoadingId === ev.id}
                                  onClick={() => void openPrescriptionPrint(ev.id)}
                                  className="flex items-center gap-1 rounded bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-100 disabled:opacity-60 transition border border-teal-200/80 shadow-2xs"
                                >
                                  <Printer className="h-3 w-3" />
                                  {invoiceLoadingId === ev.id ? "Loading…" : "Print Rx Slip"}
                                </button>
                              )}
                              {ev.eventType === "INVOICE" && (
                                <button
                                  type="button"
                                  disabled={invoiceLoadingId === ev.id}
                                  onClick={() => void openInvoicePrint(ev.id)}
                                  className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-60 transition border border-slate-200 shadow-2xs"
                                >
                                  <Printer className="h-3 w-3" />
                                  {invoiceLoadingId === ev.id ? "Loading…" : "Print Invoice"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: New Owner */}
      {showNewOwnerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Register Pet Owner</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="owner-modal-fullname" className="text-xs font-semibold text-slate-700">Full Name *</label>
                <input
                  id="owner-modal-fullname"
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Sarah Jenkins"
                />
              </div>
              <div>
                <label htmlFor="owner-modal-phone" className="text-xs font-semibold text-slate-700">Phone</label>
                <input
                  id="owner-modal-phone"
                  type="tel"
                  inputMode="numeric"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value.replace(/[^0-9+]/g, "").slice(0, 15))}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. 9948578774"
                />
              </div>
              <div>
                <label htmlFor="owner-modal-email" className="text-xs font-semibold text-slate-700">Email</label>
                <input
                  id="owner-modal-email"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="owner@example.com"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowNewOwnerModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white"
                disabled={!ownerName || createOwnerMutation.isPending}
                onClick={() => createOwnerMutation.mutate()}
              >
                {createOwnerMutation.isPending ? "Saving…" : "Save Owner"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Pet */}
      {showNewPetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Register New Pet Patient</h3>
            <div className="space-y-3">
              <div>
                <label htmlFor="pet-modal-owner" className="text-xs font-semibold text-slate-700">Owner *</label>
                <select
                  id="pet-modal-owner"
                  value={petClientId}
                  onChange={(e) => setPetClientId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                >
                  <option value="">Select owner…</option>
                  {(clientsQuery.data || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName} ({c.phone || c.email || "No contact"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="pet-modal-name" className="text-xs font-semibold text-slate-700">Pet Name *</label>
                <input
                  id="pet-modal-name"
                  type="text"
                  value={petName}
                  onChange={(e) => setPetName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Bruno"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="pet-modal-species" className="text-xs font-semibold text-slate-700">Species</label>
                  <select
                    id="pet-modal-species"
                    value={petSpecies}
                    onChange={(e) => setPetSpecies(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  >
                    <option value="CANINE">Dog (Canine)</option>
                    <option value="FELINE">Cat (Feline)</option>
                    <option value="AVIAN">Bird (Avian)</option>
                    <option value="RABBIT">Rabbit</option>
                    <option value="OTHER">Other Species</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pet-modal-size" className="text-xs font-semibold text-slate-700">Size</label>
                  <select
                    id="pet-modal-size"
                    value={petSize}
                    onChange={(e) => setPetSize(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  >
                    <option value="SMALL">Small</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LARGE">Large</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="pet-modal-breed" className="text-xs font-semibold text-slate-700">Breed</label>
                <input
                  id="pet-modal-breed"
                  type="text"
                  value={petBreed}
                  onChange={(e) => setPetBreed(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Golden Retriever"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowNewPetModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white"
                disabled={!petClientId || !petName || createPetMutation.isPending}
                onClick={() => createPetMutation.mutate()}
              >
                {createPetMutation.isPending ? "Registering…" : "Register Pet"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modals */}
      {showActionModal === "DEWORMING" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Record Deworming Dose</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Product / Medicine Name *</label>
                <input
                  type="text"
                  value={dewormProduct}
                  onChange={(e) => setDewormProduct(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Drontal Plus"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Date Administered</label>
                  <input
                    type="date"
                    value={dewormAdminDate}
                    onChange={(e) => setDewormAdminDate(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Next Due Date</label>
                  <input
                    type="date"
                    value={dewormNextDate}
                    onChange={(e) => setDewormNextDate(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowActionModal(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-amber-700 text-white hover:bg-amber-800"
                disabled={!dewormProduct || dewormMutation.isPending}
                onClick={() => dewormMutation.mutate()}
              >
                {dewormMutation.isPending ? "Recording…" : "Record Deworming"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showActionModal === "VACCINATION" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Record Vaccination Dose</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Vaccine Name *</label>
                <input
                  type="text"
                  value={vaxName}
                  onChange={(e) => setVaxName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. DHPP / Rabies / FeLV"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Date Administered</label>
                  <input
                    type="date"
                    value={vaxAdminDate}
                    onChange={(e) => setVaxAdminDate(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Next Booster Due</label>
                  <input
                    type="date"
                    value={vaxNextDate}
                    onChange={(e) => setVaxNextDate(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Batch / Lot Number</label>
                <input
                  type="text"
                  value={vaxBatch}
                  onChange={(e) => setVaxBatch(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. BATCH-2026-X"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Notes / Administration Site</label>
                <input
                  type="text"
                  value={vaxNotes}
                  onChange={(e) => setVaxNotes(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Right shoulder SC"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowActionModal(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-emerald-700 text-white hover:bg-emerald-800"
                disabled={!vaxName || vaxMutation.isPending}
                onClick={() => vaxMutation.mutate()}
              >
                {vaxMutation.isPending ? "Recording…" : "Record Vaccination"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showActionModal === "LAB" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Order Laboratory Diagnostic</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Test Name / Panel *</label>
                <input
                  type="text"
                  value={labTestName}
                  onChange={(e) => setLabTestName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Complete Blood Count (CBC) or Biochemistry Profile"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowActionModal(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-purple-800 text-white hover:bg-purple-900"
                disabled={!labTestName || labMutation.isPending}
                onClick={() => labMutation.mutate()}
              >
                {labMutation.isPending ? "Ordering…" : "Submit Lab Order"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CHECK-IN TO LIVE QUEUE MODAL */}
      {showCheckInModal && timelineQuery.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">⚡ Check-in to Live Queue</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Assign a queue token for {timelineQuery.data.patient.name} ({timelineQuery.data.client.displayName})
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Assign Attending Doctor *</span>
                  <span className="text-[11px] text-teal-700 font-semibold">Live Availability</span>
                </label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  value={checkInDoctorId}
                  onChange={(e) => setCheckInDoctorId(e.target.value)}
                >
                  <option value="">Select attending doctor…</option>
                  {(usersQuery.data?.items ?? [])
                    .filter((u) => u.roles.some((r) => r.toUpperCase() === "DOCTOR" || r.toUpperCase() === "OWNER"))
                    .map((d) => {
                      const isBusy = (queueQuery.data ?? []).some((q) => q.doctorUserId === d.id && q.status === "IN_CONSULTATION");
                      const waitingCount = (queueQuery.data ?? []).filter((q) => q.doctorUserId === d.id && q.status === "WAITING").length;
                      return (
                        <option key={d.id} value={d.id}>
                          {d.displayName} — {isBusy ? "🔴 Busy (In Consult)" : `🟢 Free Now (${waitingCount} waiting)`}
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Triage Urgency Priority</label>
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  value={checkInPriority}
                  onChange={(e) => setCheckInPriority(e.target.value as "NORMAL" | "HIGH" | "EMERGENCY")}
                >
                  <option value="NORMAL">Normal (Standard Routine Queue)</option>
                  <option value="HIGH">High (Urgent / Distressed Pet)</option>
                  <option value="EMERGENCY">Emergency (Critical / Immediate Triage)</option>
                </select>
              </div>
            </div>

            {checkInMutation.isError && (
              <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded">
                {(checkInMutation.error as Error)?.message || "Check-in failed"}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCheckInModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-emerald-600 text-white hover:bg-emerald-700 font-semibold"
                disabled={!checkInDoctorId || checkInMutation.isPending}
                onClick={() => checkInMutation.mutate()}
              >
                {checkInMutation.isPending ? "Checking in…" : "Issue Queue Token ✓"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD SOAP CONSULTATION MODAL */}
      <RecordSoapModal
        isOpen={soapModalOpen}
        onClose={() => setSoapModalOpen(false)}
        initialPatientId={selectedPatientId || ""}
      />

      {selectedPatientId && (
        <FileAttachmentsModal
          isOpen={patientFilesOpen}
          onClose={() => setPatientFilesOpen(false)}
          entityType="PATIENT"
          entityId={selectedPatientId}
          title={`Patient Medical Records: ${timelineQuery.data?.patient.name || "Patient"}`}
          subtitle={`Owner: ${timelineQuery.data?.client.displayName || "Client"} • Vaccination cards, lab tests, and imaging scans`}
        />
      )}

      <PrintableDocumentModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        documentType={printDocType}
        prescriptionData={activePrintData.prescription}
        invoiceData={activePrintData.invoice}
        invoiceId={printDocType === "INVOICE" ? activePrintData.invoiceId : undefined}
      />

      {invoiceError && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-lg">
          {invoiceError}{" "}
          <button type="button" className="font-semibold underline" onClick={() => setInvoiceError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {healthProfileOpen && timelineQuery.data?.patient && (
        <PatientHealthProfileModal
          isOpen={healthProfileOpen}
          onClose={() => setHealthProfileOpen(false)}
          patient={timelineQuery.data.patient}
          client={timelineQuery.data.client}
          timelineEvents={timelineQuery.data.events}
        />
      )}
    </div>
  );
}
