"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
  reassignQueueDoctor,
  listServices,
  listUsers,
  recordPayment,
  updateQueueStatus,
  updateClientCategory,
  currentUser,
  getClinicProfile,
  sendWhatsApp,
  sendEmail,
  getWhatsAppIntegrationStatus,
  listVaccinations,
  recordVaccination,
  listOpenBaskets,
  getBasket,
  saveBasket,
  clearBasket,
  appendToBasket,
  getInvoice,
  type InvoiceDetail,
  type SessionUser,
  type ClinicProfile,
  type AppointmentItem,
  type ClientCategory,
  type ClientRow,
  type PatientRow,
  type InvoiceRow,
  type PrescriptionRow,
  type QueueEntry,
  type VaccinationRecord,
} from "@/lib/api";
import { RecordSoapModal } from "@/components/record-soap-modal";
import {
  Printer,
  Receipt,
  Percent,
  CheckCircle2,
  AlertCircle,
  Phone,
  UserCheck,
  Award,
  Sparkles,
  HeartHandshake,
  MessageSquare,
  Mail,
  Send,
  ExternalLink,
  Syringe,
} from "lucide-react";
import { PrintableDocumentModal } from "@/components/printable-document-modal";
import {
  VETERINARY_DIAGNOSTIC_CATEGORIES,
  ALL_VETERINARY_DIAGNOSES,
  STANDARD_VETERINARY_MEDICINES,
  PRESCRIPTION_CLINICAL_PACKS,
} from "@/lib/clinical-constants";
import { phoneDigitsForInput, resolveInvoiceWhatsAppPhone } from "@/lib/whatsapp-phone";
import { formatMoney } from "@/lib/utils";
import { findConsultationService, findProductForMedicine, findServiceByKeyword, gstOf, lineGst } from "@/lib/pricing";

type ActiveTab = "queue" | "appointments" | "soap" | "pos" | "register";

type DifferentialItem = {
  label: string;
  rank: number;
  notes: string;
};

type RxLine = {
  medicineName: string;
  /** Inventory product the doctor picked; absent when the medicine is not stocked. */
  productId?: string;
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
  sourceId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  /** HSN (goods) or SAC (services) code printed on the tax invoice. */
  hsnSac?: string;
  /** No catalog or inventory price was found; reception must enter one before invoicing. */
  priceMissing?: boolean;
};

function invoiceDetailToRow(inv: InvoiceDetail): InvoiceRow {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    total: String(inv.total),
    amountPaid: String(inv.amountPaid),
    status: inv.status,
    subtotal: inv.subtotal,
    taxTotal: inv.taxTotal,
    lines: inv.lines.map((line) => ({
      id: line.id,
      description: line.description,
      lineTotal: String(line.lineTotal),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      hsnSac: line.hsnSac,
    })),
  };
}

type CompletedPaymentReceipt = {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  petName?: string;
  total: number;
  paymentMethod: string;
  dateStr: string;
  subtotal?: number;
  taxTotal?: number;
  lines: InvoiceLinePrint[];
};

type InvoiceLinePrint = { description: string; quantity: number; unitPrice: number; total: number; hsnSac?: string; taxRate?: number };

/** Printable lines from an issued invoice, keeping the real quantity, unit price, HSN/SAC and GST rate. */
function invoiceLinesForPrint(lines: InvoiceRow["lines"]): InvoiceLinePrint[] {
  return lines.map((l) => ({
    description: l.description,
    quantity: Number(l.quantity ?? 1) || 1,
    unitPrice: Number(l.unitPrice ?? l.lineTotal) || 0,
    total: Number(l.lineTotal) || 0,
    hsnSac: l.hsnSac || undefined,
    taxRate: Number(l.taxRate ?? 0) || 0,
  }));
}

export default function ClinicOperationsStation() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ActiveTab>("queue");
  const [soapModalOpen, setSoapModalOpen] = useState(false);
  const [soapModalPatientId, setSoapModalPatientId] = useState("");
  const [soapModalApptId, setSoapModalApptId] = useState("");
  const [posPrintOpen, setPosPrintOpen] = useState(false);
  const [completedReceipt, setCompletedReceipt] = useState<CompletedPaymentReceipt | null>(null);
  const [waSending, setWaSending] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  const whatsAppStatus = useQuery({
    queryKey: ["whatsapp-integration-status"],
    queryFn: getWhatsAppIntegrationStatus,
    staleTime: 60_000,
  });

  const session = useQuery<SessionUser>({
    queryKey: ["session"],
    queryFn: currentUser,
  });
  const canHandlePOS = session.data?.roles.some((r) => ["OWNER", "RECEPTIONIST"].includes(r)) ?? false;
  const isOwner = session.data?.roles.includes("OWNER") ?? false;
  const isDoctor = (session.data?.roles.includes("DOCTOR") ?? false) && !isOwner;
  const canConductClinicalSOAP = session.data?.roles.some((r) => ["OWNER", "DOCTOR"].includes(r)) ?? false;

  useEffect(() => {
    if (session.data && !canConductClinicalSOAP && activeTab === "soap") {
      setActiveTab("queue");
    }
  }, [session.data, canConductClinicalSOAP, activeTab]);

  const [queueDoctorScope, setQueueDoctorScope] = useState<"MY" | "ALL">("MY");
  const [apptDoctorScope, setApptDoctorScope] = useState<"MY" | "ALL">("MY");

  const clinicProfile = useQuery<ClinicProfile>({
    queryKey: ["clinic-profile"],
    queryFn: () => getClinicProfile(),
  });
  const maxStaffDiscountCap = Number(clinicProfile.data?.maxStaffDiscountPercent ?? 20);
  const loyalDiscountCap = Number(clinicProfile.data?.loyalDiscountPercent ?? 30);
  const ngoConsultationDiscountPercent = Number(clinicProfile.data?.ngoConsultationDiscountPercent ?? 50);
  const defaultAllowMedicineDiscount = Boolean(clinicProfile.data?.allowMedicineDiscount ?? false);
  const clinicName = clinicProfile.data?.name || "our clinic";

  // Global data queries
  const branches = useQuery({ queryKey: ["branches"], queryFn: () => listBranches() });
  const clients = useQuery({ queryKey: ["clients"], queryFn: listClients });
  const users = useQuery({ queryKey: ["users"], queryFn: listUsers });
  const services = useQuery({ queryKey: ["services"], queryFn: listServices });
  const products = useQuery({ queryKey: ["products"], queryFn: () => listProducts() });
  const allAppointments = useQuery({ queryKey: ["appointments"], queryFn: listAppointments, refetchInterval: 10_000 });
  const patients = useQuery({ queryKey: ["patients"], queryFn: () => listPatients() });

  function matchesCurrentDoctor(docId?: string | null, docName?: string | null): boolean {
    if (session.data?.id && docId && session.data.id === docId) return true;
    const currentName = session.data?.displayName;
    if (!currentName || !docName) return false;
    const cleanDoc = docName.toLowerCase().replace(/dr\.?\s*/g, "").trim();
    const cleanUser = currentName.toLowerCase().replace(/dr\.?\s*/g, "").trim();
    return cleanDoc.includes(cleanUser) || cleanUser.includes(cleanDoc);
  }

  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("vetos_active_branch_id") || "";
    }
    return "";
  });

  const branchList = branches.data?.items ?? [];
  const validBranch = branchList.find((b) => b.id === selectedBranchId);
  const branchId = validBranch ? validBranch.id : (branchList[0]?.id ?? "");

  useEffect(() => {
    if (branchId && branchId !== selectedBranchId) {
      setSelectedBranchId(branchId);
      if (typeof window !== "undefined") {
        localStorage.setItem("vetos_active_branch_id", branchId);
      }
    }
  }, [branchId, selectedBranchId]);

  useEffect(() => {
    function handleGlobalBranch(e: Event) {
      const custom = e as CustomEvent<{ branchId: string }>;
      if (custom.detail?.branchId) {
        setSelectedBranchId(custom.detail.branchId);
      }
    }
    function handleStorage(e: StorageEvent) {
      if (e.key === "vetos_active_branch_id" && e.newValue) {
        setSelectedBranchId(e.newValue);
      }
    }
    window.addEventListener("vetos-branch-changed", handleGlobalBranch);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("vetos-branch-changed", handleGlobalBranch);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Queue query with live polling
  const queue = useQuery({
    queryKey: ["queue", branchId],
    queryFn: () => listQueue(branchId),
    enabled: Boolean(branchId),
    refetchInterval: 6_000,
  });

  const allQueueItems = useMemo(() => queue.data ?? [], [queue.data]);
  const myQueueItems = useMemo(() => {
    return allQueueItems.filter((entry) => {
      const doc = users.data?.items.find((u) => u.id === entry.doctorUserId);
      return matchesCurrentDoctor(entry.doctorUserId, doc?.displayName);
    });
  }, [allQueueItems, users.data, session.data]);
  const displayedQueueItems = (isDoctor && queueDoctorScope === "MY") ? myQueueItems : allQueueItems;

  const allApptItems = useMemo(() => allAppointments.data ?? [], [allAppointments.data]);
  const myApptItems = useMemo(() => {
    return allApptItems.filter((appt) => {
      const doc = users.data?.items.find((u) => u.id === appt.doctorUserId);
      return matchesCurrentDoctor(appt.doctorUserId, doc?.displayName);
    });
  }, [allApptItems, users.data, session.data]);
  const displayedApptItems = (isDoctor && apptDoctorScope === "MY") ? myApptItems : allApptItems;

  const doctors = useMemo(() => {
    return (users.data?.items ?? []).filter((u) =>
      u.roles.some((r) => r.toUpperCase() === "DOCTOR" || r.toUpperCase() === "OWNER")
    );
  }, [users.data]);

  const doctorStats = useMemo(() => {
    return doctors.map((doc) => {
      const docEntries = (queue.data ?? []).filter((q) => q.doctorUserId === doc.id);
      const consultingEntry = docEntries.find((q) => q.status === "IN_CONSULTATION");
      const waitingEntries = docEntries.filter((q) => q.status === "WAITING");

      const consultingPatient = consultingEntry
        ? patients.data?.find((p) => p.id === consultingEntry.patientId)
        : null;

      const isConsulting = Boolean(consultingEntry);
      const isFree = !isConsulting;

      return {
        id: doc.id,
        displayName: doc.displayName,
        roles: doc.roles,
        isFree,
        isConsulting,
        consultingEntry,
        consultingPatient,
        waitingCount: waitingEntries.length,
        waitingEntries,
        totalAssigned: docEntries.length,
      };
    });
  }, [doctors, queue.data, patients.data]);

  const reassignMutation = useMutation({
    mutationFn: async ({ queueId, doctorUserId }: { queueId: string; doctorUserId: string }) => {
      return reassignQueueDoctor(queueId, doctorUserId);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      const doc = doctors.find((d) => d.id === updated.doctorUserId);
      notifySuccess(`Reassigned token #${updated.tokenNumber} to ${doc?.displayName ?? "new doctor"}!`);
    },
    onError: (err) => {
      notifyError(err);
    },
  });

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
  // The form starts empty: anything pre-filled here would be saved into a real medical record.
  const [subjective, setSubjective] = useState("");
  const [historyNotes, setHistoryNotes] = useState("");

  // O - Objective (Structured Vitals & Clinical Exam)
  const [vitalsTemp, setVitalsTemp] = useState("");
  const [vitalsTempUnit, setVitalsTempUnit] = useState<"°F" | "°C">("°F");
  const [vitalsHeartRate, setVitalsHeartRate] = useState("");
  const [vitalsRespRate, setVitalsRespRate] = useState("");
  const [vitalsWeight, setVitalsWeight] = useState("");
  const [vitalsMucousMembrane, setVitalsMucousMembrane] = useState("");
  const [vitalsCrt, setVitalsCrt] = useState("");
  const [vitalsHydration, setVitalsHydration] = useState("");
  const [vitalsExamNotes, setVitalsExamNotes] = useState("");

  const compiledVitalsExam = useMemo(() => {
    const parts: string[] = [];
    if (vitalsTemp) parts.push(`Temp: ${vitalsTemp} ${vitalsTempUnit}`);
    if (vitalsHeartRate) parts.push(`HR: ${vitalsHeartRate} bpm`);
    if (vitalsRespRate) parts.push(`RR: ${vitalsRespRate} bpm`);
    if (vitalsWeight) parts.push(`Weight: ${vitalsWeight} kg`);
    if (vitalsMucousMembrane) parts.push(`Mucous membranes: ${vitalsMucousMembrane}`);
    if (vitalsCrt) parts.push(`CRT: ${vitalsCrt}`);
    if (vitalsHydration) parts.push(`Hydration: ${vitalsHydration}`);
    if (vitalsExamNotes.trim()) parts.push(`Clinical findings: ${vitalsExamNotes.trim()}`);
    return parts.join(" | ");
  }, [vitalsTemp, vitalsTempUnit, vitalsHeartRate, vitalsRespRate, vitalsWeight, vitalsMucousMembrane, vitalsCrt, vitalsHydration, vitalsExamNotes]);

  // A - Assessment
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState("");
  const [selectedDiagCategory, setSelectedDiagCategory] = useState<string>("Common & Frequent");
  const [showDiagBrowser, setShowDiagBrowser] = useState(false);
  const [differentials, setDifferentials] = useState<DifferentialItem[]>([]);
  const [newDiffLabel, setNewDiffLabel] = useState("");

  // P - Plan
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [doctorNotes, setDoctorNotes] = useState("");
  // Empty unless the doctor schedules one; a default date would trigger unwanted follow-up reminders.
  const [followUpDate, setFollowUpDate] = useState("");

  // Prescriptions state
  const [rxLines, setRxLines] = useState<RxLine[]>([]);

  // A different patient must never inherit the previous patient's notes, vitals or prescriptions.
  useEffect(() => {
    resetSoapForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatientId]);

  function resetSoapForm() {
    setSubjective("");
    setHistoryNotes("");
    setVitalsTemp("");
    setVitalsHeartRate("");
    setVitalsRespRate("");
    setVitalsWeight("");
    setVitalsMucousMembrane("");
    setVitalsCrt("");
    setVitalsHydration("");
    setVitalsExamNotes("");
    setPrimaryDiagnosis("");
    setDifferentials([]);
    setNewDiffLabel("");
    setTreatmentPlan("");
    setDoctorNotes("");
    setFollowUpDate("");
    setRxLines([]);
  }

  function handleMedicineSelect(index: number, medName: string) {
    // Exact matches only: partial matching used to overwrite what the doctor was typing.
    const product = findProductForMedicine(products.data, medName);
    const reference = STANDARD_VETERINARY_MEDICINES.find((m) => m.name.toLowerCase() === medName.trim().toLowerCase());
    setRxLines((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next: RxLine = { ...item, medicineName: medName, productId: product?.id };
        if (!reference) return next;
        return {
          ...next,
          quantity: reference.defaultQty,
          dosage: reference.defaultDosage,
          frequency: reference.defaultFrequency,
          duration: reference.defaultDuration,
          route: reference.defaultRoute,
          instructions: reference.defaultInstructions,
        };
      })
    );
  }

  function applyClinicalPack(pack: (typeof PRESCRIPTION_CLINICAL_PACKS)[0]) {
    setRxLines(pack.lines.map((line) => ({ ...line, productId: findProductForMedicine(products.data, line.medicineName)?.id })));
    notifySuccess(`Applied ${pack.name} with standard dosing!`);
  }

  // Last completed artifacts
  const [lastConsultationId, setLastConsultationId] = useState<string | null>(null);
  const [lastPrescription, setLastPrescription] = useState<PrescriptionRow | null>(null);

  // ----------------------------------------------------
  // Active Consultation: Immunization & Preventative State
  // ----------------------------------------------------
  const [showVaxModal, setShowVaxModal] = useState(false);
  const [vaxName, setVaxName] = useState("Rabies (Anti-Rabies / ARV)");
  const [vaxAdminDate, setVaxAdminDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [vaxNextDue, setVaxNextDue] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split("T")[0];
  });
  const [vaxBatch, setVaxBatch] = useState("");
  const [vaxNotes, setVaxNotes] = useState("");
  const [vaxAddToBasket, setVaxAddToBasket] = useState(true);
  const [vaxFee, setVaxFee] = useState("");

  function handleSelectVaxType(name: string) {
    setVaxName(name);
    const d = new Date();
    if (name.toLowerCase().includes("deworm")) {
      d.setMonth(d.getMonth() + 3);
      setVaxNotes("Broad spectrum anthelmintic administered orally.");
    } else if (name.toLowerCase().includes("dhpp") || name.toLowerCase().includes("tricat") || name.toLowerCase().includes("9-in-1")) {
      d.setFullYear(d.getFullYear() + 1);
      setVaxNotes("Administered SQ scruff/hind limb.");
    } else if (name.toLowerCase().includes("cough") || name.toLowerCase().includes("bordetella") || name.toLowerCase().includes("kc")) {
      d.setFullYear(d.getFullYear() + 1);
      setVaxNotes("Administered intranasal / oral.");
    } else {
      d.setFullYear(d.getFullYear() + 1);
      setVaxNotes("Administered SQ.");
    }
    // Fee comes from the clinic's service catalog; staff enter it when no matching service exists.
    const service = findServiceByKeyword(services.data, name);
    setVaxFee(service ? String(service.defaultPrice) : "");
    setVaxNextDue(d.toISOString().split("T")[0]);
  }

  // ----------------------------------------------------
  // Unified Basket / POS State
  // ----------------------------------------------------
  const [basketClientId, setBasketClientId] = useState("");
  const [basketPatientId, setBasketPatientId] = useState("");
  const [basketLines, setBasketLines] = useState<BasketLine[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [customItemDesc, setCustomItemDesc] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [issuedInvoice, setIssuedInvoice] = useState<InvoiceRow | null>(null);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountError, setDiscountError] = useState<string>("");
  const [applyDiscountToMedicines, setApplyDiscountToMedicines] = useState<boolean>(false);
  const [invoiceCustomPhone, setInvoiceCustomPhone] = useState<string>("");
  const [whatsappPhoneEdited, setWhatsappPhoneEdited] = useState(false);

  useEffect(() => {
    if (clinicProfile.data?.allowMedicineDiscount !== undefined) {
      if (!isOwner && !clinicProfile.data.allowMedicineDiscount) {
        setApplyDiscountToMedicines(false);
      } else if (isOwner) {
        setApplyDiscountToMedicines(Boolean(clinicProfile.data.allowMedicineDiscount));
      }
    }
  }, [clinicProfile.data?.allowMedicineDiscount, isOwner]);

  useEffect(() => {
    if (!isOwner && maxStaffDiscountCap === 0 && discountPercent > 0) {
      setDiscountPercent(0);
    }
  }, [isOwner, maxStaffDiscountCap, discountPercent]);

  // ----------------------------------------------------
  // Server-side basket: one open basket per patient, shared by every computer in the clinic.
  // ----------------------------------------------------
  const openBaskets = useQuery({
    queryKey: ["open-baskets"],
    queryFn: listOpenBaskets,
    enabled: canHandlePOS,
    refetchInterval: 15_000,
  });
  /** Patient whose server basket is currently loaded; saving is blocked until the load finishes. */
  const loadedBasketPatientRef = useRef<string | null>(null);
  const pendingBasketSaveRef = useRef<(() => void) | null>(null);
  const basketLinesRef = useRef<BasketLine[]>([]);
  basketLinesRef.current = basketLines;

  useEffect(() => {
    // Flush an unsaved edit for the previous patient before switching.
    pendingBasketSaveRef.current?.();
    const patientId = basketPatientId;
    if (!patientId) {
      loadedBasketPatientRef.current = null;
      return;
    }
    if (loadedBasketPatientRef.current === patientId) return;
    let cancelled = false;
    const hadUnsavedLines = loadedBasketPatientRef.current === null && basketLinesRef.current.length > 0;
    (async () => {
      try {
        const basket = await getBasket<BasketLine>(patientId);
        if (cancelled) return;
        // Lines added before a patient was chosen are kept and saved to this patient's basket.
        if (!(hadUnsavedLines && basket.lines.length === 0)) {
          setBasketLines(basket.lines ?? []);
        }
        if (basket.clientId) setBasketClientId(basket.clientId);
        if (basket.invoiceId) {
          const inv = await getInvoice(basket.invoiceId);
          if (cancelled) return;
          setIssuedInvoice(inv.status === "PAID" ? null : invoiceDetailToRow(inv));
        } else {
          setIssuedInvoice(null);
        }
        loadedBasketPatientRef.current = patientId;
      } catch (err) {
        if (!cancelled) notifyError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basketPatientId]);

  useEffect(() => {
    const patientId = basketPatientId;
    if (!patientId || loadedBasketPatientRef.current !== patientId) return;
    const lines = basketLines;
    const clientId = basketClientId || null;
    const invoiceId = issuedInvoice?.id ?? null;
    const run = () => {
      pendingBasketSaveRef.current = null;
      saveBasket<BasketLine>(patientId, { clientId, lines, invoiceId })
        .then(() => queryClient.invalidateQueries({ queryKey: ["open-baskets"] }))
        .catch(notifyError);
    };
    pendingBasketSaveRef.current = run;
    const timer = setTimeout(run, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basketPatientId, basketClientId, basketLines, issuedInvoice?.id]);

  /** Adds lines to a patient's server basket (e.g. from the doctor's consultation) and shows them if open here. */
  async function addLinesToPatientBasket(patientId: string, lines: BasketLine[]) {
    const clientId = (patients.data ?? []).find((p) => p.id === patientId)?.clientId ?? null;
    const saved = await appendToBasket<BasketLine>(patientId, clientId, lines);
    if (loadedBasketPatientRef.current === patientId) {
      setBasketLines(saved.lines);
    }
    await queryClient.invalidateQueries({ queryKey: ["open-baskets"] });
  }

  // Auto-resolve patient & client for the unified POS basket
  const resolvedBasketPatient = useMemo(() => {
    const allPatients = patients.data ?? [];
    // 1. Explicit basketPatientId
    if (basketPatientId) {
      const found = allPatients.find((p) => p.id === basketPatientId);
      if (found) return found;
    }
    // 2. Auto-detect from patient name mentioned in basket lines (e.g. "(bruno)" or "bruno")
    for (const line of basketLines) {
      for (const p of allPatients) {
        if (p.name && p.name.length >= 2) {
          const regex = new RegExp(`\\b${p.name}\\b`, "i");
          if (regex.test(line.description)) {
            return p;
          }
        }
      }
    }
    // 3. Fallback to activePatientId if consultation is in progress
    if (activePatientId) {
      const found = allPatients.find((p) => p.id === activePatientId);
      if (found) return found;
    }
    return null;
  }, [patients.data, basketPatientId, basketLines, activePatientId]);

  const resolvedBasketClient = useMemo(() => {
    const allClients = clients.data ?? [];
    if (resolvedBasketPatient?.clientId) {
      const found = allClients.find((c) => c.id === resolvedBasketPatient.clientId);
      if (found) return found;
    }
    if (basketClientId) {
      const found = allClients.find((c) => c.id === basketClientId);
      if (found) return found;
    }
    return null;
  }, [clients.data, resolvedBasketPatient, basketClientId]);

  useEffect(() => {
    setWhatsappPhoneEdited(false);
  }, [resolvedBasketClient?.id]);

  useEffect(() => {
    if (whatsappPhoneEdited) {
      return;
    }
    setInvoiceCustomPhone(phoneDigitsForInput(resolvedBasketClient?.phone));
  }, [resolvedBasketClient?.phone, resolvedBasketClient?.id, whatsappPhoneEdited]);

  function handleAssignBasketPatient(patientId: string) {
    setBasketPatientId(patientId);
    const p = (patients.data ?? []).find((pat) => pat.id === patientId);
    setBasketClientId(p ? p.clientId : "");
  }

  // ----------------------------------------------------
  // Walk-In Registration State
  // ----------------------------------------------------
  const [regClientName, setRegClientName] = useState("");
  const [regClientPhone, setRegClientPhone] = useState("");
  const [regClientEmail, setRegClientEmail] = useState("");
  const [regCategory, setRegCategory] = useState<ClientCategory>("STANDARD");
  const [regPetName, setRegPetName] = useState("");
  const [regSpecies, setRegSpecies] = useState("CANINE");
  const [regBreed, setRegBreed] = useState("Golden Retriever");
  const [regDoctorId, setRegDoctorId] = useState("");

  // Existing Client & Pet lookup for Walk-In
  const [selectedExistingClientId, setSelectedExistingClientId] = useState<string | null>(null);
  const [selectedExistingPatientId, setSelectedExistingPatientId] = useState<string | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);

  const matchingClients = useMemo(() => {
    if (!clientSearchQuery.trim()) return [];
    const q = clientSearchQuery.toLowerCase().trim();
    return (clients.data ?? []).filter((c) => {
      const nameMatch = c.displayName?.toLowerCase().includes(q);
      const phoneMatch = c.phone?.toLowerCase().includes(q);
      const petMatch = (patients.data ?? []).some(
        (p) => p.clientId === c.id && p.name?.toLowerCase().includes(q)
      );
      return nameMatch || phoneMatch || petMatch;
    });
  }, [clients.data, patients.data, clientSearchQuery]);

  const existingClientPets = useMemo(() => {
    if (!selectedExistingClientId) return [];
    return (patients.data ?? []).filter((p) => p.clientId === selectedExistingClientId);
  }, [patients.data, selectedExistingClientId]);

  function selectExistingClient(client: ClientRow) {
    setSelectedExistingClientId(client.id);
    setRegClientName(client.displayName);
    setRegClientPhone(client.phone || "");
    setRegCategory(client.category || "STANDARD");
    setClientSearchQuery("");
    setShowClientSuggestions(false);

    const clientPets = (patients.data ?? []).filter((p) => p.clientId === client.id);
    if (clientPets.length > 0) {
      setSelectedExistingPatientId(clientPets[0].id);
      setRegPetName(clientPets[0].name);
      setRegSpecies(clientPets[0].speciesCode || "CANINE");
    } else {
      setSelectedExistingPatientId(null);
      setRegPetName("");
    }
  }

  function clearExistingClient() {
    setSelectedExistingClientId(null);
    setSelectedExistingPatientId(null);
    setRegClientName("");
    setRegClientPhone("");
    setRegPetName("");
    setRegCategory("STANDARD");
    setClientSearchQuery("");
  }

  const changeClientCategoryMutation = useMutation({
    mutationFn: async ({ clientId, category }: { clientId: string; category: ClientCategory }) => {
      return updateClientCategory(clientId, category);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      notifySuccess(
        `Client category updated to ${
          updated.category === "LOYAL"
            ? "⭐ Loyal Customer"
            : updated.category === "NGO"
            ? "🐾 NGO / Rescue"
            : "Standard Client"
        }`
      );
    },
    onError: notifyError,
  });

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
    if (!canConductClinicalSOAP) {
      notifyError("Prescription authoring and clinical consultations are restricted to Doctors and Clinic Owners only.");
      return;
    }
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
      if (!canConductClinicalSOAP) {
        throw new Error("Prescriptions and consultations can only be recorded by licensed Veterinarians and Clinic Owners.");
      }
      if (!activeAppointmentId) {
        throw new Error("No appointment linked. Please select a patient from the queue or appointments list.");
      }

      // 1. Create Consultation
      const consultRes = await createConsultation({
        appointmentId: activeAppointmentId,
        subjective,
        history: historyNotes,
        examination: compiledVitalsExam,
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

      // 3. Send the consultation and medicines to the patient's billing basket on the server,
      //    priced from the service catalog and inventory (never invented).
      const consultation = findConsultationService(services.data);
      const basketLinesToAdd: BasketLine[] = [
        {
          id: `consult-${consultRes.id}`,
          sourceType: "SERVICE",
          description: primaryDiagnosis.trim() ? `Consultation (${primaryDiagnosis.trim()})` : "Consultation",
          quantity: 1,
          unitPrice: consultation ? Number(consultation.defaultPrice) || 0 : 0,
          ...gstOf(consultation),
          priceMissing: !consultation || !(Number(consultation.defaultPrice) > 0),
        },
      ];
      (rxRes?.items ?? []).forEach((item, idx) => {
        const product = findProductForMedicine(products.data, item.medicineName, rxLines[idx]?.productId);
        const price = product ? Number(product.salePrice) || 0 : 0;
        basketLinesToAdd.push({
          id: item.id || `rx-${consultRes.id}-${idx}`,
          sourceType: "PRESCRIPTION",
          description: `Rx: ${item.medicineName}${item.dosage || item.duration ? ` (${[item.dosage, item.duration].filter(Boolean).join(", ")})` : ""}`,
          quantity: Number(item.quantity) || 1,
          unitPrice: price,
          ...gstOf(product),
          priceMissing: price <= 0,
        });
      });
      await addLinesToPatientBasket(activePatientId, basketLinesToAdd);

      // 4. If there was an active queue entry, mark it completed
      if (activeQueueEntryId) {
        await updateQueueStatus(activeQueueEntryId, "COMPLETED");
        await queryClient.invalidateQueries({ queryKey: ["queue"] });
      }

      return { consultId: consultRes.id, rx: rxRes, missingPrices: basketLinesToAdd.filter((l) => l.priceMissing).length };
    },
    onSuccess: (data) => {
      notifySuccess(
        data.missingPrices > 0
          ? `Consultation saved and sent to billing. ${data.missingPrices} item(s) have no price in the catalog/inventory — reception will set them.`
          : "Consultation saved and sent to billing with catalog prices."
      );
      resetSoapForm();
    },
    onError: notifyError,
  });

  // ----------------------------------------------------
  // Actions: Vaccination Records & Status
  // ----------------------------------------------------
  const patientVaccinations = useQuery<VaccinationRecord[]>({
    queryKey: ["patient-vaccinations", activePatientId],
    queryFn: () => listVaccinations(activePatientId),
    enabled: Boolean(activePatientId),
    refetchInterval: 10_000,
  });

  const activePatient = useMemo(() => {
    return patients.data?.find((p) => p.id === activePatientId) ?? null;
  }, [patients.data, activePatientId]);

  const isFeline = activePatient?.speciesCode?.toUpperCase() === "FELINE";

  const coreVaccineList = useMemo(() => {
    if (isFeline) {
      return [
        {
          key: "RABIES",
          name: "Rabies (Anti-Rabies / ARV)",
          defaultAdminName: "Rabies (Anti-Rabies / ARV)",
          aliases: ["rabies", "arv", "defensor", "nobivac r"],
        },
        {
          key: "TRICAT",
          name: "Tricat Trio / FVRCP",
          defaultAdminName: "Tricat Trio (FVRCP)",
          aliases: ["tricat", "fvrcp", "felocell", "panleukopenia"],
        },
        {
          key: "FELV",
          name: "FeLV (Feline Leukemia)",
          defaultAdminName: "FeLV (Feline Leukemia)",
          aliases: ["felv", "leukemia"],
        },
        {
          key: "DEWORM",
          name: "Deworming / Parasite",
          defaultAdminName: "Deworming (Feline)",
          aliases: ["deworm", "worm", "drontal", "fenbendazole"],
        },
      ];
    }
    return [
      {
        key: "RABIES",
        name: "Rabies (Anti-Rabies / ARV)",
        defaultAdminName: "Rabies (Anti-Rabies / ARV)",
        aliases: ["rabies", "arv", "defensor", "nobivac r"],
      },
      {
        key: "DHPPIL",
        name: "DHPPiL (9-in-1 / 7-in-1)",
        defaultAdminName: "DHPPiL (9-in-1 Core)",
        aliases: ["dhppil", "dhpp", "dhp", "mega-vac", "canigen", "vanguard", "9-in-1", "7-in-1", "parvo"],
      },
      {
        key: "KC",
        name: "Kennel Cough (KC / Bb)",
        defaultAdminName: "Kennel Cough (KC / Bordetella)",
        aliases: ["kennel", "cough", "bordetella", "kc", "bronchicine"],
      },
      {
        key: "DEWORM",
        name: "Deworming / Parasite",
        defaultAdminName: "Deworming (Broad Spectrum)",
        aliases: ["deworm", "worm", "drontal", "fenbendazole", "praziquantel"],
      },
    ];
  }, [isFeline]);

  const coreVaccineStatusList = useMemo(() => {
    const records = patientVaccinations.data ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return coreVaccineList.map((vaxDef) => {
      const matchingDoses = records.filter((r) => {
        const name = (r.vaccineName || "").toLowerCase();
        return vaxDef.aliases.some((a) => name.includes(a));
      });

      matchingDoses.sort((a, b) => new Date(b.administeredOn).getTime() - new Date(a.administeredOn).getTime());
      const latest = matchingDoses[0];

      if (!latest) {
        return {
          key: vaxDef.key,
          name: vaxDef.name,
          defaultAdminName: vaxDef.defaultAdminName,
          status: "NOT_RECORDED" as const,
          statusBadge: "NOT RECORDED",
          description: "No vaccination on file",
          lastDoseDate: null,
          nextDueDate: null,
        };
      }

      if (latest.nextDueOn) {
        const dueDate = new Date(latest.nextDueOn);
        dueDate.setHours(0, 0, 0, 0);
        const diffMs = dueDate.getTime() - today.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          return {
            key: vaxDef.key,
            name: vaxDef.name,
            defaultAdminName: latest.vaccineName,
            status: "OVERDUE" as const,
            statusBadge: "OVERDUE",
            description: `Booster overdue by ${Math.abs(diffDays)}d (${latest.nextDueOn})`,
            lastDoseDate: latest.administeredOn,
            nextDueDate: latest.nextDueOn,
          };
        } else if (diffDays <= 30) {
          return {
            key: vaxDef.key,
            name: vaxDef.name,
            defaultAdminName: latest.vaccineName,
            status: "DUE_SOON" as const,
            statusBadge: `DUE IN ${diffDays}D`,
            description: `Booster due ${latest.nextDueOn}`,
            lastDoseDate: latest.administeredOn,
            nextDueDate: latest.nextDueOn,
          };
        } else {
          return {
            key: vaxDef.key,
            name: vaxDef.name,
            defaultAdminName: latest.vaccineName,
            status: "UP_TO_DATE" as const,
            statusBadge: "UP TO DATE",
            description: `Current • Next booster ${latest.nextDueOn}`,
            lastDoseDate: latest.administeredOn,
            nextDueDate: latest.nextDueOn,
          };
        }
      }

      return {
        key: vaxDef.key,
        name: vaxDef.name,
        defaultAdminName: latest.vaccineName,
        status: "UP_TO_DATE" as const,
        statusBadge: "RECORDED",
        description: `Given on ${latest.administeredOn}`,
        lastDoseDate: latest.administeredOn,
        nextDueDate: null,
      };
    });
  }, [coreVaccineList, patientVaccinations.data]);

  const recordVaccineMutation = useMutation({
    mutationFn: async () => {
      if (!activePatientId) throw new Error("No active patient selected for consultation");
      if (!vaxName.trim()) throw new Error("Please enter or select vaccine name");

      const res = await recordVaccination({
        patientId: activePatientId,
        vaccineName: vaxName.trim(),
        administeredOn: vaxAdminDate,
        nextDueOn: vaxNextDue || undefined,
        batchNumber: vaxBatch.trim() || undefined,
        notes: vaxNotes.trim() || undefined,
      });

      if (vaxAddToBasket) {
        const fee = parseFloat(vaxFee);
        const priced = Number.isFinite(fee) && fee > 0;
        await addLinesToPatientBasket(activePatientId, [
          {
            id: `vax-${Date.now()}`,
            sourceType: "SERVICE",
            description: `Vaccination: ${vaxName.trim()} ${vaxBatch.trim() ? `(Batch: ${vaxBatch.trim()})` : ""}`.trim(),
            quantity: 1,
            unitPrice: priced ? fee : 0,
            taxRate: 0,
            priceMissing: !priced,
          },
        ]);
      }

      return res;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["patient-vaccinations", activePatientId] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      setShowVaxModal(false);
      notifySuccess(
        `💉 ${res.vaccineName} recorded for ${activePatient?.name || "patient"}! Added to immunization card${
          vaxAddToBasket
            ? Number(vaxFee) > 0
              ? ` & billing basket (${formatMoney(vaxFee)})`
              : " & billing basket (price to be set at reception)"
            : ""
        }.`
      );
    },
    onError: notifyError,
  });

  // ----------------------------------------------------
  // Actions: Unified Basket / Billing
  // ----------------------------------------------------
  const servicesSubtotal = useMemo(() => {
    return basketLines
      .filter((line) => line.sourceType === "SERVICE" || line.sourceType === "CUSTOM")
      .reduce((acc, line) => acc + line.quantity * line.unitPrice, 0);
  }, [basketLines]);

  const medicinesSubtotal = useMemo(() => {
    return basketLines
      .filter((line) => line.sourceType === "PRODUCT" || line.sourceType === "PRESCRIPTION")
      .reduce((acc, line) => acc + line.quantity * line.unitPrice, 0);
  }, [basketLines]);

  const basketTotal = useMemo(() => {
    return servicesSubtotal + medicinesSubtotal;
  }, [servicesSubtotal, medicinesSubtotal]);

  const currentCategory: ClientCategory = resolvedBasketClient?.category || "STANDARD";

  const effectiveStaffCap = useMemo(() => {
    if (isOwner) return 100;
    if (maxStaffDiscountCap === 0) return 0;
    if (currentCategory === "LOYAL") return loyalDiscountCap;
    if (currentCategory === "NGO") return Math.max(ngoConsultationDiscountPercent, maxStaffDiscountCap);
    return maxStaffDiscountCap;
  }, [isOwner, maxStaffDiscountCap, currentCategory, loyalDiscountCap, ngoConsultationDiscountPercent]);

  function handleDiscountChange(valStr: string) {
    if (!isOwner && maxStaffDiscountCap === 0) {
      setDiscountError("Counter discounts are currently disabled for reception staff by the clinic owner.");
      setDiscountPercent(0);
      return;
    }
    const parsed = Math.max(0, Math.min(100, parseFloat(valStr) || 0));
    if (!isOwner && parsed > effectiveStaffCap) {
      setDiscountError(
        `Staff discount cap for ${
          currentCategory === "LOYAL"
            ? "Loyal Customers"
            : currentCategory === "NGO"
            ? "NGO Rescues"
            : "standard clients"
        } is ${effectiveStaffCap}%. Only clinic OWNER can grant higher.`
      );
      setDiscountPercent(effectiveStaffCap);
    } else {
      setDiscountError("");
      setDiscountPercent(parsed);
    }
  }

  const discountAmount = useMemo(() => {
    if (applyDiscountToMedicines) {
      return Number(((basketTotal * discountPercent) / 100).toFixed(2));
    } else {
      return Number(((servicesSubtotal * discountPercent) / 100).toFixed(2));
    }
  }, [basketTotal, servicesSubtotal, discountPercent, applyDiscountToMedicines]);

  const finalTotal = useMemo(() => {
    return Math.max(0, Number((basketTotal - discountAmount).toFixed(2)));
  }, [basketTotal, discountAmount]);

  const pricesIncludeTax = clinicProfile.data?.pricesIncludeTax ?? true;

  /** This line's share of the counter discount (medicines are excluded unless allowed). */
  function lineDiscountFor(line: BasketLine): number {
    const lineGross = line.quantity * line.unitPrice;
    const isMedicine = line.sourceType === "PRODUCT" || line.sourceType === "PRESCRIPTION";
    if (applyDiscountToMedicines) {
      return basketTotal > 0 ? Number(((lineGross / basketTotal) * discountAmount).toFixed(2)) : 0;
    }
    if (isMedicine) return 0;
    return servicesSubtotal > 0 ? Number(((lineGross / servicesSubtotal) * discountAmount).toFixed(2)) : 0;
  }

  // GST on the basket, worked out per line the same way the server does when it issues the invoice.
  const basketGst = basketLines.reduce(
    (acc, line) => acc + lineGst(line.quantity * line.unitPrice - lineDiscountFor(line), line.taxRate || 0, pricesIncludeTax).tax,
    0
  );
  const payableTotal = pricesIncludeTax ? finalTotal : Number((finalTotal + basketGst).toFixed(2));

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
        ...gstOf(s),
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
        sourceId: p.id,
        description: p.name,
        quantity: 1,
        unitPrice: p.salePrice,
        ...gstOf(p),
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
    setCustomItemPrice("");
  }

  function setBasketLinePrice(index: number, value: string) {
    const price = Number(value);
    setBasketLines((prev) =>
      prev.map((line, i) =>
        i === index ? { ...line, unitPrice: Number.isFinite(price) && price >= 0 ? price : 0 } : line
      )
    );
  }

  function removeBasketLine(index: number) {
    setBasketLines((prev) => prev.filter((_, i) => i !== index));
  }

  const issueUnifiedInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (basketLines.length === 0) {
        throw new Error("Cannot issue invoice for an empty basket.");
      }

      const unpriced = basketLines.filter((line) => !(line.unitPrice > 0));
      if (unpriced.length > 0) {
        throw new Error(
          `Set a price before invoicing: ${unpriced.map((line) => line.description).join(", ")}. ` +
            "Add missing services to the catalog and medicines to inventory so they are priced automatically next time."
        );
      }

      if (!isOwner && maxStaffDiscountCap === 0 && discountPercent > 0) {
        throw new Error(
          "Counter discounts are currently disabled for reception staff by the clinic owner."
        );
      }

      if (!isOwner && discountPercent > effectiveStaffCap) {
        throw new Error(
          `Discount exceeds staff cap of ${effectiveStaffCap}%. Only clinic OWNER can authorize higher discounts.`
        );
      }

      if (!isOwner && !defaultAllowMedicineDiscount && applyDiscountToMedicines) {
        throw new Error(
          "Discounts on medicines & prescriptions are restricted by the clinic owner. Margin protection is active."
        );
      }

      // Standalone POS sale (Consultation / Services / Prescriptions / Retail Products)
      const lines = basketLines.map((line) => {
        const lineDiscount = lineDiscountFor(line);
        return {
          sourceType: line.sourceType || "CUSTOM",
          sourceId: line.sourceId || (line.id?.startsWith("prod-") ? line.id.split("-")[1] : undefined),
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: lineDiscount,
          taxRate: line.taxRate || 0,
          hsnSac: line.hsnSac,
        };
      });

      return issueInvoice({
        branchId: branchId || undefined,
        patientId: resolvedBasketPatient?.id || activePatientId || undefined,
        clientId: resolvedBasketClient?.id || basketClientId || undefined,
        lines,
      });
    },
    onSuccess: (inv) => {
      setIssuedInvoice(inv);
      notifySuccess(`Invoice #${inv.invoiceNumber} created. Total due: ${formatMoney(inv.total)}`);
    },
    onError: notifyError,
  });

  const toggleMedicineDiscountPermission = useMutation({
    mutationFn: async (allow: boolean) => {
      if (!clinicProfile.data) throw new Error("Clinic profile not loaded");
      return apiJson<ClinicProfile>("/api/v1/clinic", {
        method: "PATCH",
        body: JSON.stringify({
          version: clinicProfile.data.version,
          allowMedicineDiscount: allow,
        }),
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["clinic-profile"], updated);
      queryClient.invalidateQueries({ queryKey: ["clinic-profile"] });
      setApplyDiscountToMedicines(Boolean(updated?.allowMedicineDiscount));
      notifySuccess(
        updated?.allowMedicineDiscount
          ? "✅ Receptionist permission: Medicine discounts are now ALLOWED."
          : "🔒 Receptionist permission: Medicine discounts are now RESTRICTED (margins protected)."
      );
    },
    onError: (err) => notifyError(err),
  });

  const toggleStaffDiscountPermission = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!clinicProfile.data) throw new Error("Clinic profile not loaded");
      return apiJson<ClinicProfile>("/api/v1/clinic", {
        method: "PATCH",
        body: JSON.stringify({
          version: clinicProfile.data.version,
          maxStaffDiscountPercent: enabled ? 20 : 0,
        }),
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["clinic-profile"], updated);
      queryClient.invalidateQueries({ queryKey: ["clinic-profile"] });
      notifySuccess(
        (updated?.maxStaffDiscountPercent ?? 0) > 0
          ? `✅ Receptionist permission: Staff discounts are now ALLOWED (up to ${updated?.maxStaffDiscountPercent}%).`
          : "🔒 Receptionist permission: Staff discounts are now DISABLED (0% locked for staff)."
      );
    },
    onError: (err) => notifyError(err),
  });

  const payUnifiedInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!issuedInvoice) throw new Error("Please issue invoice first");
      const remaining = Number(issuedInvoice.total) - Number(issuedInvoice.amountPaid);
      const idempotencyKey = `pay-${issuedInvoice.id}-${Date.now()}`;
      await recordPayment(issuedInvoice.id, String(remaining), idempotencyKey, paymentMethod);
    },
    onSuccess: () => {
      if (issuedInvoice) {
        const client =
          resolvedBasketClient ??
          clients.data?.find(
            (c) =>
              c.id === basketClientId ||
              (activePatientId && c.id === patients.data?.find((p) => p.id === activePatientId)?.clientId)
          );
        const pet = patients.data?.find((p) => p.id === (basketPatientId || activePatientId));
        const receiptPhone =
          invoiceCustomPhone.trim() || phoneDigitsForInput(client?.phone) || client?.phone || "";
        setCompletedReceipt({
          invoiceId: issuedInvoice.id,
          invoiceNumber: issuedInvoice.invoiceNumber,
          clientName: client?.displayName || "Clinic Walk-In Client",
          clientPhone: receiptPhone,
          clientEmail: client?.email || "",
          petName: pet?.name || "Patient",
          total: Number(issuedInvoice.total) || payableTotal,
          subtotal: issuedInvoice.subtotal !== undefined ? Number(issuedInvoice.subtotal) : undefined,
          taxTotal: issuedInvoice.taxTotal !== undefined ? Number(issuedInvoice.taxTotal) : undefined,
          paymentMethod,
          dateStr: new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
          lines: (issuedInvoice.lines && issuedInvoice.lines.length > 0)
            ? invoiceLinesForPrint(issuedInvoice.lines)
            : basketLines.map((b) => ({
                description: b.description,
                quantity: b.quantity,
                unitPrice: b.unitPrice,
                total: b.quantity * b.unitPrice,
              })),
        });
      }

      notifySuccess("Payment received and settled! Prescription marked DISPENSED & inventory deducted automatically.");
      queryClient.invalidateQueries({ queryKey: ["pharmacy-batches"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["prescriptions"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
      const paidPatientId = basketPatientId;
      // Stop the pending autosave from re-creating the basket we are about to clear.
      pendingBasketSaveRef.current = null;
      loadedBasketPatientRef.current = null;
      setIssuedInvoice(null);
      setBasketLines([]);
      setBasketPatientId("");
      setBasketClientId("");
      if (paidPatientId) {
        clearBasket(paidPatientId)
          .then(() => queryClient.invalidateQueries({ queryKey: ["open-baskets"] }))
          .catch(notifyError);
      }
    },
    onError: notifyError,
  });

  async function queueInvoicePdfWhatsApp(
    formattedPhone: string,
    invoiceId: string,
    ownerName: string,
    invoiceNumber: string,
    bodyPreview: string
  ) {
    await sendWhatsApp({
      to: formattedPhone,
      template: "INVOICE_PDF",
      templateParams: [ownerName],
      invoiceId,
      body: bodyPreview,
    });
    notifySuccess(
      `Invoice #${invoiceNumber} queued for WhatsApp (+${formattedPhone}). Open Communications → Outbox within a minute — status must show PROCESSED with a Meta message id, not FAILED (missing token/phone id shows there).`
    );
  }

  function explainWhatsAppSendError(err: unknown, formattedPhone: string) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("131030") || errMsg.includes("not in allowed list")) {
      notifyError(
        `Meta: +${formattedPhone} must be on your WhatsApp allowed recipient list (API Setup) before sending.`
      );
    } else {
      notifyError(`WhatsApp: ${errMsg}`);
    }
  }

  async function handleWhatsAppReceipt(receipt: CompletedPaymentReceipt) {
    const formattedPhone = resolveInvoiceWhatsAppPhone(
      invoiceCustomPhone,
      receipt.clientPhone || resolvedBasketClient?.phone
    );
    if (!formattedPhone) {
      notifyError("Add a valid 10-digit WhatsApp number for this client.");
      return;
    }
    if (!receipt.invoiceId) {
      notifyError("Invoice id missing; cannot send PDF on WhatsApp.");
      return;
    }
    const msg = `*${clinicName.toUpperCase()}*\nOfficial Invoice Receipt\n-------------------------------\nInvoice: #${receipt.invoiceNumber}\nDate: ${receipt.dateStr}\nClient: ${receipt.clientName}\nPatient: ${receipt.petName || "Pet"}\nPayment: ${receipt.paymentMethod} (PAID)\nTotal Amount: ₹${receipt.total.toFixed(2)}\n-------------------------------\nThank you for trusting ${clinicName}! For appointments & queries, call our front desk.`;

    setWaSending(true);
    try {
      await queueInvoicePdfWhatsApp(
        formattedPhone,
        receipt.invoiceId,
        receipt.clientName || "Pet Parent",
        receipt.invoiceNumber,
        msg
      );
    } catch (err: unknown) {
      explainWhatsAppSendError(err, formattedPhone);
    } finally {
      setWaSending(false);
    }
  }

  async function handleSendInvoiceWhatsApp(inv?: InvoiceRow | null) {
    if (!inv?.id) {
      notifyError("Issue the invoice first, then send on WhatsApp.");
      return;
    }
    const client =
      resolvedBasketClient ??
      clients.data?.find(
        (c) =>
          c.id === basketClientId ||
          (activePatientId && c.id === patients.data?.find((p) => p.id === activePatientId)?.clientId)
      );
    const patient = patients.data?.find((p) => p.id === (basketPatientId || activePatientId));
    const formattedPhone = resolveInvoiceWhatsAppPhone(invoiceCustomPhone, client?.phone);
    if (!formattedPhone) {
      notifyError("Enter the client's 10-digit WhatsApp number (or add phone on the client profile).");
      return;
    }

    const invNumber = inv.invoiceNumber;
    const itemsSummary = basketLines
      .slice(0, 6)
      .map((l) => `• ${l.description}: ${l.quantity}x @ ₹${l.unitPrice} = ₹${(l.quantity * l.unitPrice).toFixed(2)}`)
      .join("\n");

    const msg = `*${clinicName.toUpperCase()}*\n🐾 Official Invoice & Bill Receipt\n-------------------------------\nInvoice: #${invNumber}\nDate: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}\nClient: ${client?.displayName || "Pet Parent"}\nPatient: ${patient?.name || "Pet"}\n\n*Bill Breakdown:*\n${itemsSummary}\n\n*Total Due / Paid: ₹${Number(inv.total).toFixed(2)}*\nStatus: ${inv.status === "PAID" || completedReceipt ? "PAID ✓" : "DUE AT COUNTER"}\n-------------------------------\nThank you for choosing ${clinicName}! For questions, call our clinic desk.`;

    setWaSending(true);
    try {
      const ownerName = client?.displayName || "Pet Parent";
      await queueInvoicePdfWhatsApp(formattedPhone, inv.id, ownerName, invNumber, msg);
    } catch (err: unknown) {
      explainWhatsAppSendError(err, formattedPhone);
    } finally {
      setWaSending(false);
    }
  }

  async function handleEmailReceipt(receipt: CompletedPaymentReceipt) {
    let emailTo = receipt.clientEmail;
    if (!emailTo) {
      const emailInput = window.prompt("Enter client email address to send invoice receipt:", "");
      if (!emailInput || !emailInput.trim()) return;
      emailTo = emailInput.trim();
      receipt.clientEmail = emailTo;
    }
    const subject = `${clinicName} - Invoice Receipt #${receipt.invoiceNumber}`;
    const body = `Dear ${receipt.clientName},\n\nThank you for visiting ${clinicName}.\n\nHere are your payment details:\n- Invoice Number: #${receipt.invoiceNumber}\n- Date: ${receipt.dateStr}\n- Patient: ${receipt.petName || "Pet"}\n- Amount Paid: ${formatMoney(receipt.total)}\n- Payment Mode: ${receipt.paymentMethod}\n\nItems:\n${receipt.lines.map((l) => `• ${l.description} x ${l.quantity} = ${formatMoney(l.total)}`).join("\n")}\n\nTotal Paid: ${formatMoney(receipt.total)}\nStatus: PAID\n\nWarm regards,\n${clinicName} Team`;

    setEmailSending(true);
    try {
      await sendEmail({
        to: emailTo,
        subject,
        body,
      });
      notifySuccess(`Invoice receipt emailed to ${emailTo}`);
    } catch (err: unknown) {
      notifyError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setEmailSending(false);
    }
  }

  // ----------------------------------------------------
  // Actions: Walk-In Registration
  // ----------------------------------------------------
  const executeWalkInRegistration = useMutation({
    mutationFn: async () => {
      if (!regClientName || !regPetName || !regDoctorId) {
        throw new Error("Please fill in Owner Name, Pet Name, and Assigned Doctor.");
      }
      if (!branchId) {
        throw new Error("No active clinic branch found. Please ensure a branch exists.");
      }

      let clientId = selectedExistingClientId;
      let patientId = selectedExistingPatientId;
      let petName = regPetName;

      // 1. Client: if not existing, create new
      if (!clientId) {
        const client = await createClient({
          displayName: regClientName,
          phone: regClientPhone || "9999999999",
          email: regClientEmail || undefined,
          consentWhatsapp: true,
          consentEmail: true,
          category: regCategory,
        });
        clientId = client.id;
      } else if (regCategory) {
        const existingClient = (clients.data ?? []).find((c) => c.id === clientId);
        if (existingClient && existingClient.category !== regCategory) {
          await updateClientCategory(clientId, regCategory);
        }
      }

      // 2. Patient: if not existing, create new under this client
      if (!patientId) {
        const patient = await createPatient({
          clientId,
          name: regPetName,
          speciesCode: regSpecies,
          breed: regBreed,
          sizeCategory: "MEDIUM",
        });
        patientId = patient.id;
        petName = patient.name;
      }

      // 3. Appointment (Now)
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 60 * 1000);
      const appt = await createAppointment({
        branchId,
        patientId,
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

      return { petName, token: qEntry.tokenNumber };
    },
    onSuccess: (res) => {
      notifySuccess(`Walk-in checked in! ${res.petName} assigned Queue Token #${res.token}`);
      clearExistingClient();
      setActiveTab("queue");
    },
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

          {canConductClinicalSOAP && (
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
          )}

          {canHandlePOS && (
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
          )}

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
          {isOwner ? (
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
          ) : (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 shadow-2xs">
              {(branches.data?.items ?? []).find((b) => b.id === branchId)?.name ?? "Main"}
            </span>
          )}
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

          {/* Real-Time Doctor Availability Board */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-base font-bold shadow-2xs">
                  👨‍⚕️
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Attending Doctors Live Status &amp; Availability</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                      Live Triage
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Real-time doctor occupancy for Branch: <span className="font-semibold text-slate-700">{validBranch?.name ?? "Main"}</span>. Check who is free before assigning patients.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 px-2.5 py-0.5 font-bold shadow-2xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {doctorStats.filter((d) => d.isFree).length} Free Now
                </span>
                {doctorStats.some((d) => d.isConsulting) && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-800 px-2.5 py-0.5 font-bold shadow-2xs">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    {doctorStats.filter((d) => d.isConsulting).length} In Consult
                  </span>
                )}
              </div>
            </div>

            {/* Doctor Status Cards Grid */}
            {doctorStats.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
                <p className="text-xs font-semibold text-slate-700">No attending doctors registered yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Doctors registered with role DOCTOR or OWNER in your clinic will automatically appear here with their live status.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {doctorStats.map((d) => {
                const isFree = d.isFree;
                return (
                  <div
                    key={d.id}
                    className={`rounded-xl border p-3.5 transition-all flex flex-col justify-between ${
                      d.isConsulting
                        ? "border-rose-200 bg-rose-50/40 shadow-xs"
                        : d.waitingCount > 0
                        ? "border-amber-200 bg-amber-50/40"
                        : "border-emerald-200 bg-emerald-50/30 shadow-xs ring-1 ring-emerald-500/20"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                            {d.displayName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {d.roles.includes("OWNER") ? "Clinic Director / Doctor" : "Attending Doctor"}
                          </p>
                        </div>
                        {d.isConsulting ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 text-[10px] font-bold">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                            Busy (In Consult)
                          </span>
                        ) : d.waitingCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 text-[10px] font-bold">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                            {d.waitingCount} in Queue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            Free &amp; Ready
                          </span>
                        )}
                      </div>

                      {/* Current Patient info */}
                      {d.isConsulting ? (
                        <div className="rounded-lg bg-white/90 border border-rose-200 p-2 text-xs">
                          <p className="text-[11px] text-rose-900 font-semibold flex items-center gap-1">
                            <span>🩺 In room with:</span>
                            <span className="font-bold underline">{d.consultingPatient?.name || "Patient"}</span>
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Token #{d.consultingEntry?.tokenNumber} • {d.waitingCount} more waiting in line
                          </p>
                        </div>
                      ) : d.waitingCount > 0 ? (
                        <div className="rounded-lg bg-white/90 border border-amber-200 p-2 text-xs">
                          <p className="text-[11px] text-amber-900 font-semibold">
                            Next in line: Token #{d.waitingEntries[0]?.tokenNumber}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Available after current queue
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-white/90 border border-emerald-200 p-2 text-xs">
                          <p className="text-[11px] text-emerald-800 font-semibold flex items-center gap-1">
                            <span>✨ Free right now</span>
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            0 patients in waiting line • Ready immediately
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 font-medium">
                        {d.totalAssigned} total in queue
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRegDoctorId(d.id);
                          setActiveTab("register");
                        }}
                        className={`text-xs font-bold px-2.5 py-1 rounded-md transition flex items-center gap-1 ${
                          isFree && d.waitingCount === 0
                            ? "bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                        }`}
                      >
                        + Assign Patient
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {/* Doctor Scope Toggle for Live Queue */}
          {isDoctor && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">Triage Scope:</span>
                <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setQueueDoctorScope("MY")}
                    className={`rounded px-3 py-1 font-bold text-xs transition-all ${
                      queueDoctorScope === "MY"
                        ? "bg-white text-teal-800 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    👤 My Patients ({myQueueItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueDoctorScope("ALL")}
                    className={`rounded px-3 py-1 font-bold text-xs transition-all ${
                      queueDoctorScope === "ALL"
                        ? "bg-white text-teal-800 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    🏥 All Clinic ({allQueueItems.length})
                  </button>
                </div>
              </div>

              {queueDoctorScope === "MY" ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-teal-800 font-medium bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">
                    Showing only patients assigned to <strong>{session.data?.displayName}</strong>
                  </span>
                  {allQueueItems.length > myQueueItems.length && (
                    <button
                      type="button"
                      onClick={() => setQueueDoctorScope("ALL")}
                      className="text-xs font-bold text-teal-700 hover:text-teal-900 underline"
                    >
                      Show other {allQueueItems.length - myQueueItems.length} clinic patients →
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                  Viewing full hospital queue ({allQueueItems.length} patients)
                </span>
              )}
            </div>
          )}

          {queue.isLoading ? (
            <p className="text-sm text-slate-500 py-8">Loading queue records…</p>
          ) : displayedQueueItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <p className="text-base font-semibold text-slate-700">
                {isDoctor && queueDoctorScope === "MY"
                  ? `No waiting patients currently assigned to ${session.data?.displayName || "you"}`
                  : "No patients currently in queue"}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {isDoctor && queueDoctorScope === "MY" && allQueueItems.length > 0
                  ? `There are ${allQueueItems.length} patient(s) waiting in the clinic queue.`
                  : "Check in an existing appointment or register a walk-in patient."}
              </p>
              <div className="mt-4 flex justify-center gap-3">
                {isDoctor && queueDoctorScope === "MY" && allQueueItems.length > 0 ? (
                  <Button size="sm" onClick={() => setQueueDoctorScope("ALL")}>
                    Switch to All Clinic Queue ({allQueueItems.length})
                  </Button>
                ) : (
                  <>
                    <Button size="sm" onClick={() => setActiveTab("appointments")}>
                      View Appointments
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setActiveTab("register")}>
                      Register Walk-In
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedQueueItems.map((entry) => {
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
                          {(() => {
                            const qPatient = patients.data?.find((p) => p.id === entry.patientId);
                            const qClient = clients.data?.find((c) => c.id === qPatient?.clientId);
                            return (
                              <div>
                                <p className="text-sm font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                  <span>{qPatient?.name ?? `Patient ${entry.patientId.slice(0, 8)}…`}</span>
                                  {qClient?.category === "LOYAL" && (
                                    <span className="rounded bg-amber-100 border border-amber-300 text-amber-900 px-1.5 py-0.2 text-[10px] font-bold">
                                      ⭐ Loyal
                                    </span>
                                  )}
                                  {qClient?.category === "NGO" && (
                                    <span className="rounded bg-emerald-100 border border-emerald-300 text-emerald-900 px-1.5 py-0.2 text-[10px] font-bold">
                                      🐾 NGO Rescue
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {qPatient?.speciesCode ?? ""} {qClient ? `• Client: ${qClient.displayName}` : ""}
                                </p>
                              </div>
                            );
                          })()}
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

                    <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600 space-y-2">
                      <div className="flex items-center justify-between">
                        <p>
                          <span className="text-slate-400 font-medium">Doctor:</span>{" "}
                          <span className="font-semibold text-slate-800">{doctor?.displayName ?? "Any available"}</span>
                        </p>
                        {/* Live status badge of assigned doctor */}
                        {(() => {
                          const docStat = doctorStats.find((d) => d.id === entry.doctorUserId);
                          if (isConsulting) {
                            return <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">In Consult Now</span>;
                          }
                          if (docStat?.isConsulting) {
                            return <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Doctor with another patient</span>;
                          }
                          return <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Doctor Free Now</span>;
                        })()}
                      </div>

                      {/* Reassign transfer selector */}
                      {!isConsulting && (
                        <div className="flex items-center gap-2 pt-1">
                          <label className="text-[11px] text-slate-500 font-medium shrink-0">Transfer:</label>
                          <select
                            className="text-xs rounded border border-slate-200 bg-white px-2 py-1 text-slate-700 focus:outline-none focus:border-teal-600 flex-1"
                            value={entry.doctorUserId}
                            disabled={reassignMutation.isPending}
                            onChange={(e) => {
                              const newDocId = e.target.value;
                              if (newDocId && newDocId !== entry.doctorUserId) {
                                reassignMutation.mutate({ queueId: entry.id, doctorUserId: newDocId });
                              }
                            }}
                          >
                            {doctorStats.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.displayName} — {d.isFree ? "🟢 Free Now" : `🔴 In Consult (${d.consultingPatient?.name || "Patient"})`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <p className="text-[11px]">
                        <span className="text-slate-400 font-medium">Checked in:</span>{" "}
                        {new Date(entry.checkedInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                      {canConductClinicalSOAP ? (
                        <Button
                          size="sm"
                          className="flex-1 bg-teal-700 hover:bg-teal-800 text-white"
                          onClick={() => startConsultationForQueueEntry(entry)}
                        >
                          Start SOAP Consult →
                        </Button>
                      ) : (
                        <div className="flex-1 text-center py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-500">
                          Assigned to Doctor
                        </div>
                      )}
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

          {/* Doctor Scope Toggle for Appointments */}
          {isDoctor && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">Roster Scope:</span>
                <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setApptDoctorScope("MY")}
                    className={`rounded px-3 py-1 font-bold text-xs transition-all ${
                      apptDoctorScope === "MY"
                        ? "bg-white text-teal-800 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    👤 My Appointments ({myApptItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setApptDoctorScope("ALL")}
                    className={`rounded px-3 py-1 font-bold text-xs transition-all ${
                      apptDoctorScope === "ALL"
                        ? "bg-white text-teal-800 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    🏥 All Appointments ({allApptItems.length})
                  </button>
                </div>
              </div>

              {apptDoctorScope === "MY" ? (
                <span className="text-xs text-teal-800 font-medium bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">
                  Showing appointments for <strong>{session.data?.displayName}</strong>
                </span>
              ) : (
                <span className="text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                  Viewing all clinic doctors' appointments
                </span>
              )}
            </div>
          )}

          {allAppointments.isLoading ? (
            <p className="text-sm text-slate-500 py-8">Loading schedule…</p>
          ) : displayedApptItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <p className="text-base font-semibold text-slate-700">
                {isDoctor && apptDoctorScope === "MY"
                  ? `No appointments found for ${session.data?.displayName || "you"}`
                  : "No scheduled appointments found"}
              </p>
              {isDoctor && apptDoctorScope === "MY" && allApptItems.length > 0 && (
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={() => setApptDoctorScope("ALL")}>
                    View All Clinic Appointments ({allApptItems.length})
                  </Button>
                </div>
              )}
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
                  {displayedApptItems.map((appt) => {
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
                          ) : canConductClinicalSOAP ? (
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
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">Checked In</span>
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
        !canConductClinicalSOAP ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-8 text-center max-w-xl mx-auto my-12 shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700 mb-3 border border-rose-200">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Doctor &amp; Clinic Owner Access Only</h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Clinical SOAP examinations, diagnostics, and prescribing are strictly restricted to licensed Veterinarians and Clinic Owners. Reception staff have operational access to Live Queue Triage, Appointments, Walk-in Check-in, and POS Billing.
            </p>
            <Button
              className="mt-5 bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs"
              onClick={() => setActiveTab("queue")}
            >
              Return to Live Queue Triage →
            </Button>
          </div>
        ) : (
        <div className="flex flex-col gap-6">
          {/* Active Context Banner */}
          <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-teal-800">Active Consultation Session</p>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                {(() => {
                  const activePatient = patients.data?.find((p) => p.id === activePatientId);
                  const activeClient = clients.data?.find((c) => c.id === activePatient?.clientId);
                  return (
                    <>
                      <span className="text-sm font-semibold text-slate-900">
                        Patient:{" "}
                        <span className="text-teal-900 font-bold">
                          {activePatient
                            ? `${activePatient.name} (${activePatient.speciesCode})`
                            : "None selected"}
                        </span>
                      </span>
                      {activeClient && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span className="text-sm font-semibold text-slate-900">
                            Owner: <span className="text-slate-800 font-bold">{activeClient.displayName}</span>
                          </span>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {basketLines.length > 0 && canHandlePOS && (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-2xs"
                  onClick={() => setActiveTab("pos")}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Invoice Ready ({basketLines.length}) • Send WhatsApp →</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("queue")}
              >
                Select from Queue
              </Button>
              <Button
                size="sm"
                className="bg-teal-700 hover:bg-teal-800 text-white font-bold"
                onClick={() => submitSoapConsultation.mutate()}
                disabled={!activeAppointmentId || submitSoapConsultation.isPending}
              >
                {submitSoapConsultation.isPending ? "Finalizing…" : "Finalize Consult & Rx ✓"}
              </Button>
            </div>
          </div>

          {!activeAppointmentId && (queue.data ?? []).length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Patients Waiting in Today's Queue:
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Click a waiting patient to load their chart and start consultation:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {queue.data?.map((entry) => {
                  const p = patients.data?.find((pat) => pat.id === entry.patientId);
                  return (
                    <button
                      key={entry.id}
                      onClick={() => startConsultationForQueueEntry(entry)}
                      className="flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs hover:bg-amber-100 hover:border-amber-400 transition"
                    >
                      <span className="rounded bg-teal-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        #{entry.tokenNumber}
                      </span>
                      <span>{p?.name ?? "Patient"}</span>
                      <span className="text-[10px] text-slate-500">({p?.speciesCode ?? ""})</span>
                      <span className="text-teal-700 font-bold">Start →</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Patient Immunization & Preventative Health Card */}
          {activePatientId ? (
            <div className="rounded-xl border border-teal-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-teal-50 p-2 text-teal-800 border border-teal-200">
                    <Syringe className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">
                        Patient Immunization & Preventative Card
                      </h4>
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-900 uppercase">
                        {activePatient?.name ?? "Patient"} • {activePatient?.speciesCode ?? "Canine"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Live vaccine status, scheduled PRM booster reminders, and direct visit administration.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
                    onClick={() => {
                      handleSelectVaxType(isFeline ? "Tricat Trio (FVRCP)" : "Rabies (Anti-Rabies / ARV)");
                      setShowVaxModal(true);
                    }}
                  >
                    <Syringe className="h-3.5 w-3.5" />
                    + Administer Vaccine in this Visit
                  </Button>
                </div>
              </div>

              {/* Vaccine Status Badges Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                {coreVaccineStatusList.map((vax) => {
                  return (
                    <div
                      key={vax.key}
                      onClick={() => {
                        handleSelectVaxType(vax.defaultAdminName);
                        setShowVaxModal(true);
                      }}
                      className={`group cursor-pointer rounded-lg border p-3 transition hover:shadow-sm ${
                        vax.status === "UP_TO_DATE"
                          ? "border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50"
                          : vax.status === "DUE_SOON"
                          ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50"
                          : vax.status === "OVERDUE"
                          ? "border-rose-200 bg-rose-50/50 hover:bg-rose-50"
                          : "border-slate-200 bg-slate-50/70 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{vax.name}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                            vax.status === "UP_TO_DATE"
                              ? "bg-emerald-100 text-emerald-800"
                              : vax.status === "DUE_SOON"
                              ? "bg-amber-100 text-amber-800"
                              : vax.status === "OVERDUE"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {vax.statusBadge}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium text-slate-600 mt-1">
                        {vax.description}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-mono">
                          {vax.lastDoseDate ? `Given: ${vax.lastDoseDate}` : "Never given"}
                        </span>
                        <span className="font-bold text-teal-800 group-hover:underline">
                          + Log Dose →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Recent Doses History Summary */}
              {(patientVaccinations.data ?? []).length > 0 && (
                <div className="border-t border-slate-100 pt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">Recorded Doses on File ({patientVaccinations.data?.length}):</span>
                  {(patientVaccinations.data ?? []).slice(0, 3).map((r) => (
                    <span key={r.id} className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700 border border-slate-200">
                      💉 {r.vaccineName} ({r.administeredOn}) {r.batchNumber ? `• Lot: ${r.batchNumber}` : ""}
                    </span>
                  ))}
                  {(patientVaccinations.data ?? []).length > 3 && (
                    <span className="text-slate-400">+{patientVaccinations.data!.length - 3} more</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-teal-200 bg-white p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-teal-50 p-2 text-teal-800 border border-teal-200">
                    <Syringe className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Patient Immunization Status &amp; Vaccination History Card
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Live vaccine status (Rabies, DHPPiL, Kennel Cough, Deworming) and direct dose administration.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-600">Quick Select Patient to View Vaccines:</span>
                {patients.data?.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setActivePatientId(p.id);
                      setBasketPatientId(p.id);
                    }}
                    className="rounded-lg border border-teal-200 bg-teal-50/70 px-2.5 py-1 text-xs font-bold text-teal-900 hover:bg-teal-100 hover:border-teal-400 transition flex items-center gap-1 shadow-2xs"
                  >
                    <span>🐾 {p.name}</span>
                    <span className="text-[10px] text-slate-500 font-normal">({p.speciesCode})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-800 text-xs font-bold text-white">
                    O
                  </span>
                  <h3 className="text-base font-bold text-slate-900">Objective (Vitals & Physical Exam)</h3>
                </div>
                <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                  Structured TPR Grid
                </span>
              </div>

              {/* Vitals Input Grid: Pre-built fields with units */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Temperature */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block">
                    Temperature
                  </label>
                  <div className="mt-1 flex items-center">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="101.5"
                      value={vitalsTemp}
                      onChange={(e) => setVitalsTemp(e.target.value)}
                      className="w-full rounded-l border border-slate-300 bg-white p-1.5 text-sm font-bold text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                    <select
                      value={vitalsTempUnit}
                      onChange={(e) => setVitalsTempUnit(e.target.value as "°F" | "°C")}
                      className="rounded-r border-y border-r border-slate-300 bg-slate-100 p-1.5 text-xs font-bold text-slate-700 focus:outline-none"
                    >
                      <option value="°F">°F</option>
                      <option value="°C">°C</option>
                    </select>
                  </div>
                </div>

                {/* Heart Rate */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block">
                    Heart Rate (HR)
                  </label>
                  <div className="mt-1 flex items-center">
                    <input
                      type="number"
                      placeholder="110"
                      value={vitalsHeartRate}
                      onChange={(e) => setVitalsHeartRate(e.target.value)}
                      className="w-full rounded-l border border-slate-300 bg-white p-1.5 text-sm font-bold text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                    <span className="rounded-r border-y border-r border-slate-300 bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-600">
                      bpm
                    </span>
                  </div>
                </div>

                {/* Respiratory Rate */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block">
                    Respiration (RR)
                  </label>
                  <div className="mt-1 flex items-center">
                    <input
                      type="number"
                      placeholder="24"
                      value={vitalsRespRate}
                      onChange={(e) => setVitalsRespRate(e.target.value)}
                      className="w-full rounded-l border border-slate-300 bg-white p-1.5 text-sm font-bold text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                    <span className="rounded-r border-y border-r border-slate-300 bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-600">
                      bpm
                    </span>
                  </div>
                </div>

                {/* Weight */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block">
                    Body Weight
                  </label>
                  <div className="mt-1 flex items-center">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="14.5"
                      value={vitalsWeight}
                      onChange={(e) => setVitalsWeight(e.target.value)}
                      className="w-full rounded-l border border-slate-300 bg-white p-1.5 text-sm font-bold text-slate-800 focus:border-teal-600 focus:outline-none"
                    />
                    <span className="rounded-r border-y border-r border-slate-300 bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-600">
                      kg
                    </span>
                  </div>
                </div>
              </div>

              {/* Physical Status Selectors: MM, CRT, Hydration */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Mucous Membranes (MM)</label>
                  <select
                    value={vitalsMucousMembrane}
                    onChange={(e) => setVitalsMucousMembrane(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-xs font-medium text-slate-800 focus:border-teal-600 focus:outline-none"
                  >
                    <option value="">— Not assessed —</option>
                    <option value="Pink (Normal)">Pink (Normal)</option>
                    <option value="Pale">Pale / Anemic</option>
                    <option value="Congested / Injected">Congested / Injected</option>
                    <option value="Icteric (Jaundice)">Icteric (Jaundice / Yellow)</option>
                    <option value="Cyanotic (Blue)">Cyanotic (Blue / Hypoxic)</option>
                    <option value="Dry / Tacky">Dry / Tacky</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Capillary Refill Time (CRT)</label>
                  <select
                    value={vitalsCrt}
                    onChange={(e) => setVitalsCrt(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-xs font-medium text-slate-800 focus:border-teal-600 focus:outline-none"
                  >
                    <option value="">— Not assessed —</option>
                    <option value="< 2s (Normal)">&lt; 2 seconds (Normal)</option>
                    <option value="2-3s (Borderline)">2 - 3 seconds (Borderline)</option>
                    <option value="> 3s (Prolonged)">&gt; 3 seconds (Prolonged)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Hydration Status</label>
                  <select
                    value={vitalsHydration}
                    onChange={(e) => setVitalsHydration(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-xs font-medium text-slate-800 focus:border-teal-600 focus:outline-none"
                  >
                    <option value="">— Not assessed —</option>
                    <option value="Normal (< 5%)">Normal (&lt; 5% loss)</option>
                    <option value="Mild (5-7%)">Mild Dehydration (5-7%)</option>
                    <option value="Moderate (8-10%)">Moderate Dehydration (8-10%)</option>
                    <option value="Severe (> 10%)">Severe Dehydration (&gt; 10%)</option>
                  </select>
                </div>
              </div>

              {/* Clinical Observations & Palpation Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Clinical Examination & Palpation Observations
                </label>
                <textarea
                  rows={2}
                  className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                  placeholder="e.g. Abdomen soft, no palpable masses, thoracic auscultation unremarkable, lymph nodes normal..."
                  value={vitalsExamNotes}
                  onChange={(e) => setVitalsExamNotes(e.target.value)}
                />
              </div>

              {/* Live Formatted Summary Bar */}
              <div className="rounded-lg bg-teal-50/70 border border-teal-200/80 p-2.5 text-xs text-teal-900 flex flex-wrap items-center gap-2">
                <span className="font-bold uppercase tracking-wider text-[10px] text-teal-700 bg-teal-100 px-2 py-0.5 rounded">
                  Record Preview:
                </span>
                <span className="font-mono text-[11px] text-teal-950 flex-1">
                  {compiledVitalsExam}
                </span>
              </div>
            </div>

            {/* A: Assessment */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-800 text-xs font-bold text-white">
                    A
                  </span>
                  <h3 className="text-base font-bold text-slate-900">Assessment (Diagnosis & Differentials)</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDiagBrowser(!showDiagBrowser)}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-2.5 py-1 rounded-md transition-colors"
                >
                  {showDiagBrowser ? "Hide Catalog ▲" : "📖 Quick Diagnosis Catalog ▼"}
                </button>
              </div>

              {/* Quick Diagnostic Catalog Browser */}
              {showDiagBrowser && (
                <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3 space-y-2">
                  <div className="flex flex-wrap gap-1.5 border-b border-teal-200/70 pb-2">
                    {VETERINARY_DIAGNOSTIC_CATEGORIES.map((cat) => (
                      <button
                        key={cat.category}
                        type="button"
                        onClick={() => setSelectedDiagCategory(cat.category)}
                        className={`text-[11px] px-2 py-1 rounded-md font-semibold transition-colors ${
                          selectedDiagCategory === cat.category
                            ? "bg-teal-700 text-white shadow-xs"
                            : "bg-white text-teal-900 hover:bg-teal-100/80 border border-teal-200"
                        }`}
                      >
                        {cat.icon} {cat.category}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1 max-h-36 overflow-y-auto">
                    {(
                      VETERINARY_DIAGNOSTIC_CATEGORIES.find((c) => c.category === selectedDiagCategory)?.diagnoses || []
                    ).map((diag) => (
                      <button
                        key={diag}
                        type="button"
                        onClick={() => setPrimaryDiagnosis(diag)}
                        title="Click to set as Primary Diagnosis"
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-all text-left ${
                          primaryDiagnosis === diag
                            ? "bg-teal-800 text-white border-teal-900 font-bold"
                            : "bg-white text-slate-800 border-slate-300 hover:border-teal-500 hover:bg-teal-50"
                        }`}
                      >
                        + {diag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-600">Primary Diagnosis</label>
                  <span className="text-[10px] text-teal-700 font-medium">✨ Auto-suggest active (60+ standard diagnoses)</span>
                </div>
                <input
                  type="text"
                  list="veterinary-primary-diagnoses-list"
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm font-semibold text-slate-900 focus:border-teal-600 focus:outline-none bg-white shadow-2xs"
                  value={primaryDiagnosis}
                  onChange={(e) => setPrimaryDiagnosis(e.target.value)}
                  placeholder="Type to search standard veterinary diagnoses…"
                />
                <datalist id="veterinary-primary-diagnoses-list">
                  {ALL_VETERINARY_DIAGNOSES.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
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
                    list="veterinary-primary-diagnoses-list"
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
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">Digital Prescription (Rx)</h3>
                <p className="text-xs text-slate-500">Meds will automatically be sent to pharmacy and billing basket.</p>
              </div>
              <div className="flex items-center gap-2">
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
            </div>

            {/* Quick Treatment Protocol Packs */}
            <div className="mt-3 rounded-lg bg-teal-50/60 border border-teal-200 p-2.5">
              <div className="text-[11px] font-bold text-teal-950 mb-1.5 flex items-center gap-1">
                <span>⚡ 1-Click Clinical Treatment Packs:</span>
                <span className="text-teal-700 font-normal">Pre-loads standard veterinary prescription regimens</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESCRIPTION_CLINICAL_PACKS.map((pack) => (
                  <button
                    key={pack.name}
                    type="button"
                    onClick={() => applyClinicalPack(pack)}
                    title={pack.description}
                    className="text-[11px] font-semibold bg-white text-teal-900 hover:bg-teal-700 hover:text-white border border-teal-300 rounded-md px-2.5 py-1 transition-all flex items-center gap-1 shadow-2xs"
                  >
                    <span>{pack.icon}</span>
                    <span>{pack.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <datalist id="veterinary-medications-catalog-list">
              {(products.data ?? [])
                .filter((p) => !p.status || p.status.toUpperCase() === "ACTIVE")
                .map((p) => (
                  <option key={p.id} value={p.name}>
                    {formatMoney(p.salePrice)} per {p.unit || "unit"} • In inventory
                  </option>
                ))}
            </datalist>

            <div className="mt-4 space-y-3">
              {rxLines.map((line, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-7 gap-2 rounded-lg bg-slate-50 p-3 border border-slate-200 text-xs">
                  <div className="md:col-span-2">
                    <label className="font-semibold text-slate-600">Medicine (from inventory)</label>
                    <input
                      type="text"
                      list="veterinary-medications-catalog-list"
                      className="mt-1 w-full rounded border border-slate-300 p-1.5 font-medium text-slate-900 bg-white"
                      value={line.medicineName}
                      onChange={(e) => handleMedicineSelect(index, e.target.value)}
                      placeholder="Search your inventory…"
                    />
                    {line.medicineName.trim() && (
                      line.productId ? (
                        <p className="mt-1 text-[10px] font-semibold text-emerald-700">
                          ✓ In inventory • {formatMoney(findProductForMedicine(products.data, line.medicineName, line.productId)?.salePrice)}
                        </p>
                      ) : (
                        <p className="mt-1 text-[10px] font-semibold text-amber-700">
                          ⚠ Not in inventory — reception will set the price
                        </p>
                      )
                    )}
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600">Qty</label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded border border-slate-300 p-1.5 bg-white"
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
                      className="mt-1 w-full rounded border border-slate-300 p-1.5 bg-white"
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
                      className="mt-1 w-full rounded border border-slate-300 p-1.5 bg-white"
                      value={line.frequency ? `${line.frequency}${line.duration ? ` (${line.duration})` : ""}` : ""}
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
                      className="mt-1 w-full rounded border border-slate-300 p-1.5 bg-white"
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
              {canHandlePOS && lastPrescription && (
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
        )
      )}

      {/* ========================================================================= */}
      {/* TAB 4: UNIFIED INVOICE BASKET & POS                                       */}
      {/* ========================================================================= */}
      {canHandlePOS && activeTab === "pos" && (
        <div className="flex flex-col gap-6">
          {whatsAppStatus.data &&
            (!whatsAppStatus.data.accessTokenConfigured || !whatsAppStatus.data.phoneNumberIdConfigured) && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <strong>WhatsApp is not fully configured on the server.</strong> Set{" "}
                <code className="text-xs">META_WHATSAPP_TOKEN</code> and{" "}
                <code className="text-xs">META_WHATSAPP_PHONE_NUMBER_ID</code> in{" "}
                <code className="text-xs">.env.production</code>, then run{" "}
                <code className="text-xs">./scripts/deploy.sh</code>. Until then, outbox sends will fail with a clear error.
              </div>
            )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Unified Invoice Basket & Clinic POS</h2>
              <p className="text-sm text-slate-500">
                Consolidated billing for consultation fees, dispensed prescriptions, and retail products.
              </p>
            </div>
            {issuedInvoice && (
              <div className="flex items-center gap-2">
                <Button
                  id="btn-print-pos-header"
                  size="sm"
                  variant="outline"
                  onClick={() => setPosPrintOpen(true)}
                  className="flex items-center gap-1.5 border-teal-300 text-teal-800 bg-teal-50 hover:bg-teal-100"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Receipt / Slip
                </Button>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                  Invoice #{issuedInvoice.invoiceNumber} Ready for Payment
                </span>
              </div>
            )}
          </div>

          {/* Customer & Patient Identification Banner */}
          <div className="rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50/70 via-emerald-50/40 to-white p-4 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm font-bold text-xl">
                  {resolvedBasketPatient ? (resolvedBasketPatient.name[0]?.toUpperCase() || "🐾") : "👤"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-700">
                      Billed Patient & Pet Owner
                    </span>
                    {resolvedBasketPatient ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" /> Linked to Bill
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                        <AlertCircle className="h-3 w-3" /> Walk-In / Unassigned
                      </span>
                    )}
                  </div>
                  {resolvedBasketPatient ? (
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="font-bold text-slate-900 text-base">
                        🐾 {resolvedBasketPatient.name}
                      </span>
                      <span className="rounded bg-teal-100 px-2 py-0.5 text-[11px] font-bold text-teal-800 uppercase">
                        {resolvedBasketPatient.speciesCode}
                      </span>
                      <span className="text-slate-500 font-medium">
                        • Owner: <strong className="text-slate-800 font-bold">{resolvedBasketClient?.displayName || "Unknown Owner"}</strong>
                      </span>
                      {resolvedBasketClient?.phone && (
                        <span className="flex items-center gap-1 text-slate-700 font-semibold text-xs bg-white px-2 py-0.5 rounded border border-slate-200">
                          <Phone className="h-3 w-3 text-teal-600" /> {resolvedBasketClient.phone}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mt-0.5">
                      No client or patient selected. Choose below to link this bill to a specific pet owner.
                    </p>
                  )}
                </div>
              </div>

              {/* Patient & Owner Quick Switcher */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                  Switch / Assign Pet:
                </label>
                <select
                  id="select-pos-patient"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none"
                  value={resolvedBasketPatient?.id || ""}
                  onChange={(e) => handleAssignBasketPatient(e.target.value)}
                >
                  <option value="">-- Unassigned Walk-In / Retail Counter --</option>
                  {(patients.data ?? []).map((pat) => {
                    const owner = (clients.data ?? []).find((c) => c.id === pat.clientId);
                    return (
                      <option key={pat.id} value={pat.id}>
                        {pat.name} ({pat.speciesCode}) — Owner: {owner?.displayName || "Unknown"} {owner?.phone ? `(📞 ${owner.phone})` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
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
                {/* 1-Click WhatsApp & Email Receipt Dispatch Banner */}
                {completedReceipt && (
                  <div className="mb-4 rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-900 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                              ✓ Paid via {completedReceipt.paymentMethod}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">#{completedReceipt.invoiceNumber}</span>
                          </div>
                          <p className="text-sm font-extrabold text-slate-900 mt-0.5">
                            ₹{completedReceipt.total.toFixed(2)} Collected • {completedReceipt.clientName} ({completedReceipt.petName})
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCompletedReceipt(null)}
                        className="text-slate-400 hover:text-slate-700 text-xs font-bold p-1 cursor-pointer"
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-200/80">
                      <button
                        type="button"
                        id="btn-whatsapp-invoice"
                        onClick={() => handleWhatsAppReceipt(completedReceipt)}
                        disabled={waSending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 text-xs font-bold shadow-2xs transition active:scale-95 cursor-pointer"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>{waSending ? "Sending…" : "Send on WhatsApp"}</span>
                      </button>

                      <button
                        type="button"
                        id="btn-email-invoice"
                        onClick={() => handleEmailReceipt(completedReceipt)}
                        disabled={emailSending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white px-3 py-1.5 text-xs font-bold shadow-2xs transition active:scale-95 cursor-pointer"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        <span>{emailSending ? "Sending…" : "Send via Email"}</span>
                      </button>

                      <button
                        type="button"
                        id="btn-print-pos-success"
                        onClick={() => setPosPrintOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-bold shadow-2xs transition active:scale-95 cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5 text-slate-600" />
                        <span>Print Receipt</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCompletedReceipt(null)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 ml-auto cursor-pointer"
                      >
                        + Start New Sale
                      </button>
                    </div>
                  </div>
                )}

                {(openBaskets.data ?? []).length > 0 && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                    <p className="text-xs font-bold text-amber-900">
                      Waiting to bill ({openBaskets.data?.length}) — sent from consultations on any computer
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(openBaskets.data ?? []).map((b) => (
                        <button
                          key={b.patientId}
                          type="button"
                          onClick={() => handleAssignBasketPatient(b.patientId)}
                          className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                            b.patientId === basketPatientId
                              ? "border-teal-600 bg-teal-600 text-white"
                              : "border-amber-300 bg-white text-slate-800 hover:border-teal-500"
                          }`}
                        >
                          {b.patientName}
                          {b.clientName ? ` • ${b.clientName}` : ""} • {b.lineCount} item{b.lineCount === 1 ? "" : "s"}
                          {b.invoiceId ? " • invoice issued" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Current Cart Items</h3>
                    {resolvedBasketPatient && (
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <p className="text-xs text-teal-700 font-medium">
                          Patient: <strong className="font-bold text-slate-900">{resolvedBasketPatient.name}</strong> • Client: <strong className="font-bold text-slate-900">{resolvedBasketClient?.displayName || "Unknown"}</strong> {resolvedBasketClient?.phone ? `(📞 ${resolvedBasketClient.phone})` : ""}
                        </p>
                        {resolvedBasketClient && (
                          <div className="inline-flex items-center gap-1.5 ml-1">
                            {currentCategory === "LOYAL" ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-300 text-amber-800 px-2 py-0.5 text-[11px] font-bold">
                                ⭐ Loyal Customer ({loyalDiscountCap}% Cap)
                              </span>
                            ) : currentCategory === "NGO" ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-300 text-emerald-800 px-2 py-0.5 text-[11px] font-bold">
                                🐾 NGO / Stray Rescue ({ngoConsultationDiscountPercent}% Consultation)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 text-[11px] font-semibold">
                                Standard Client
                              </span>
                            )}

                            {/* Dropdown to switch client category on the fly */}
                            <select
                              aria-label="Client category"
                              className="text-[10px] font-semibold bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-600 hover:border-teal-600 focus:outline-none"
                              value={currentCategory}
                              onChange={(e) => {
                                if (resolvedBasketClient?.id) {
                                  changeClientCategoryMutation.mutate({
                                    clientId: resolvedBasketClient.id,
                                    category: e.target.value as ClientCategory,
                                  });
                                }
                              }}
                            >
                              <option value="STANDARD">Standard Client</option>
                              <option value="LOYAL">⭐ Loyal Customer</option>
                              <option value="NGO">🐾 NGO / Rescue</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                    {basketLines.length} line item{basketLines.length === 1 ? "" : "s"}
                  </span>
                </div>

                {basketLines.length === 0 ? (
                  <p className="text-sm text-slate-400 py-10 text-center">The basket is empty. Add services or products above.</p>
                ) : (
                  <div className="divide-y divide-slate-100 mt-2">
                    {basketLines.map((line, index) => {
                      const isMed = line.sourceType === "PRODUCT" || line.sourceType === "PRESCRIPTION";
                      return (
                        <div key={line.id} className="py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{line.description}</p>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                isMed
                                  ? "bg-purple-100 text-purple-800 border border-purple-200"
                                  : "bg-teal-100 text-teal-800 border border-teal-200"
                              }`}
                            >
                              {line.sourceType === "PRESCRIPTION"
                                ? "💊 Prescribed Medicine"
                                : line.sourceType === "PRODUCT"
                                ? "📦 Pharmacy Product"
                                : "🩺 Consultation / Procedure"}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            {line.priceMissing || !(line.unitPrice > 0) ? (
                              <label className="flex items-center gap-1 text-xs text-amber-800">
                                <span className="font-semibold">⚠ Set price</span>
                                <span>{line.quantity} ×</span>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  aria-label={`Unit price for ${line.description}`}
                                  className="w-24 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-sm text-slate-900"
                                  value={line.unitPrice > 0 ? line.unitPrice : ""}
                                  placeholder="₹ per unit"
                                  onChange={(e) => setBasketLinePrice(index, e.target.value)}
                                />
                              </label>
                            ) : (
                              <span className="text-sm text-slate-500">
                                {line.quantity} × {formatMoney(line.unitPrice)}
                              </span>
                            )}
                            <span className="text-sm font-bold text-slate-900 w-24 text-right">
                              {formatMoney(line.quantity * line.unitPrice)}
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
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Basket Total & Checkout Strip */}
              <div className="border-t border-slate-200 pt-4 mt-6 space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-sm font-semibold text-slate-600">
                    <span>Basket Subtotal</span>
                    <span>₹{basketTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Consultation / Services: ₹{servicesSubtotal.toFixed(2)}</span>
                    <span>Medicines / Products: ₹{medicinesSubtotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Counter Discount Controls */}
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-3">
                  {/* Owner Live Toggle Permission Bar */}
                  {isOwner && (
                    <div className="rounded-lg bg-teal-50/90 border border-teal-200 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-teal-950">
                        <span className="rounded bg-teal-800 text-white px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase">
                          👑 Owner Control
                        </span>
                        <span>Receptionist Access Permissions:</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4">
                        {/* Toggle 1: Allow Staff Discounts */}
                        <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800 hover:text-teal-950">
                          <input
                            id="toggle-owner-staff-discounts"
                            type="checkbox"
                            checked={maxStaffDiscountCap > 0}
                            disabled={toggleStaffDiscountPermission.isPending}
                            onChange={(e) => toggleStaffDiscountPermission.mutate(e.target.checked)}
                            className="h-4 w-4 rounded border-teal-300 text-teal-700 focus:ring-teal-500 cursor-pointer"
                          />
                          <span>
                            Allow Staff Discounts{" "}
                            <span className={maxStaffDiscountCap > 0 ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>
                              ({maxStaffDiscountCap > 0 ? `${maxStaffDiscountCap}% Cap` : "Disabled"})
                            </span>
                          </span>
                        </label>

                        {/* Toggle 2: Allow Medicine Discounts */}
                        <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800 hover:text-teal-950">
                          <input
                            id="toggle-owner-medicine-discounts"
                            type="checkbox"
                            checked={defaultAllowMedicineDiscount}
                            disabled={toggleMedicineDiscountPermission.isPending}
                            onChange={(e) => toggleMedicineDiscountPermission.mutate(e.target.checked)}
                            className="h-4 w-4 rounded border-teal-300 text-teal-700 focus:ring-teal-500 cursor-pointer"
                          />
                          <span>
                            Allow Medicine Discounts{" "}
                            <span className={defaultAllowMedicineDiscount ? "text-emerald-700 font-bold" : "text-rose-700 font-bold"}>
                              ({defaultAllowMedicineDiscount ? "Enabled" : "Restricted"})
                            </span>
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">Counter Discount:</span>
                      <div className="flex items-center">
                        <input
                          id="input-pos-discount"
                          type="number"
                          min="0"
                          max={isOwner ? 100 : effectiveStaffCap}
                          disabled={!isOwner && maxStaffDiscountCap === 0}
                          value={discountPercent}
                          onChange={(e) => handleDiscountChange(e.target.value)}
                          className={`w-16 rounded-md border p-1 text-xs font-bold text-center shadow-xs focus:ring-1 focus:ring-teal-600 ${
                            !isOwner && maxStaffDiscountCap === 0
                              ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                              : "bg-white text-slate-800 border-slate-300"
                          }`}
                        />
                        <span className="ml-1 text-xs font-bold text-slate-500">%</span>
                      </div>

                      {/* Tier Badge / Policy Cap info */}
                      {!isOwner && maxStaffDiscountCap === 0 ? (
                        <span className="rounded bg-rose-50 border border-rose-200 text-rose-700 px-2 py-0.5 text-[10px] font-bold flex items-center gap-1">
                          🔒 Discounts Disabled by Clinic Owner
                        </span>
                      ) : isOwner ? (
                        <span className="rounded bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                          👑 Owner Override (Uncapped)
                        </span>
                      ) : currentCategory === "LOYAL" ? (
                        <span className="rounded bg-amber-100 border border-amber-300 text-amber-900 px-2 py-0.5 text-[10px] font-bold">
                          ⭐ Loyal Customer Cap: {loyalDiscountCap}% Max
                        </span>
                      ) : currentCategory === "NGO" ? (
                        <span className="rounded bg-emerald-100 border border-emerald-300 text-emerald-900 px-2 py-0.5 text-[10px] font-bold">
                          🐾 NGO Rescue Tier: {ngoConsultationDiscountPercent}% Flat on Consultation
                        </span>
                      ) : (
                        <span className="rounded bg-slate-200 text-slate-700 px-2 py-0.5 text-[10px] font-semibold">
                          Staff Cap: {maxStaffDiscountCap}% Max
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-bold text-rose-600">
                        {discountAmount > 0 ? `-₹${discountAmount.toFixed(2)}` : "₹0.00"}
                      </span>
                    </div>
                  </div>

                  {/* Quick Presets for Customer Tiers */}
                  {(isOwner || maxStaffDiscountCap > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] font-semibold text-slate-500 mr-1">Quick Presets:</span>
                      {currentCategory === "NGO" && (
                        <button
                          type="button"
                          id="btn-apply-ngo-discount"
                          onClick={() => {
                            setDiscountPercent(ngoConsultationDiscountPercent);
                            setDiscountError("");
                          }}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-md border transition-all ${
                            discountPercent === ngoConsultationDiscountPercent
                              ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                              : "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                          }`}
                        >
                          🐾 Apply NGO {ngoConsultationDiscountPercent}% Rescue Discount (Consultation)
                        </button>
                      )}
                      {currentCategory === "LOYAL" && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountPercent(10);
                              setDiscountError("");
                            }}
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                              discountPercent === 10 ? "bg-amber-600 text-white" : "bg-white text-slate-700 border-slate-200"
                            }`}
                          >
                            10%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountPercent(20);
                              setDiscountError("");
                            }}
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                              discountPercent === 20 ? "bg-amber-600 text-white" : "bg-white text-slate-700 border-slate-200"
                            }`}
                          >
                            20%
                          </button>
                          <button
                            type="button"
                            id="btn-apply-loyal-max"
                            onClick={() => {
                              setDiscountPercent(loyalDiscountCap);
                              setDiscountError("");
                            }}
                            className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                              discountPercent === loyalDiscountCap
                                ? "bg-amber-600 text-white border-amber-700"
                                : "bg-amber-50 text-amber-900 border-amber-300"
                            }`}
                          >
                            ⭐ {loyalDiscountCap}% (Loyal Max)
                          </button>
                        </>
                      )}
                      {currentCategory === "STANDARD" && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountPercent(5);
                              setDiscountError("");
                            }}
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                              discountPercent === 5 ? "bg-teal-700 text-white" : "bg-white text-slate-700 border-slate-200"
                            }`}
                          >
                            5%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountPercent(10);
                              setDiscountError("");
                            }}
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                              discountPercent === 10 ? "bg-teal-700 text-white" : "bg-white text-slate-700 border-slate-200"
                            }`}
                          >
                            10%
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDiscountPercent(maxStaffDiscountCap);
                              setDiscountError("");
                            }}
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                              discountPercent === maxStaffDiscountCap ? "bg-teal-700 text-white" : "bg-white text-slate-700 border-slate-200"
                            }`}
                          >
                            {maxStaffDiscountCap}% (Max)
                          </button>
                        </>
                      )}
                      {discountPercent > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setDiscountPercent(0);
                            setDiscountError("");
                          }}
                          className="text-[10px] text-slate-400 hover:text-slate-600 underline ml-1"
                        >
                          Reset (0%)
                        </button>
                      )}
                    </div>
                  )}

                  {/* Medicine Discount Toggle */}
                  <div className="border-t border-slate-200/80 pt-2.5">
                    <label className={`flex items-start gap-2.5 ${!isOwner && !defaultAllowMedicineDiscount ? "cursor-not-allowed opacity-80" : "cursor-pointer"}`}>
                      <input
                        id="checkbox-apply-medicine-discount"
                        type="checkbox"
                        disabled={!isOwner && !defaultAllowMedicineDiscount}
                        checked={applyDiscountToMedicines}
                        onChange={(e) => setApplyDiscountToMedicines(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 disabled:cursor-not-allowed"
                      />
                      <div className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">
                            Apply discount to medicines & prescriptions also
                          </span>
                          {!isOwner && !defaultAllowMedicineDiscount && (
                            <span className="rounded bg-rose-50 border border-rose-200 text-rose-700 px-1.5 py-0.5 text-[10px] font-bold">
                              🔒 Locked by Owner
                            </span>
                          )}
                          {!isOwner && defaultAllowMedicineDiscount && (
                            <span className="rounded bg-emerald-50 border border-emerald-200 text-emerald-700 px-1.5 py-0.5 text-[10px] font-bold">
                              🔓 Owner Authorized
                            </span>
                          )}
                        </div>
                        {applyDiscountToMedicines ? (
                          <p className="text-[11px] text-teal-800 mt-0.5 font-medium">
                            💊 Discount applies to full basket (services ₹{servicesSubtotal.toFixed(2)} + medicines ₹{medicinesSubtotal.toFixed(2)} = ₹{basketTotal.toFixed(2)})
                          </p>
                        ) : !isOwner && !defaultAllowMedicineDiscount ? (
                          <p className="text-[11px] text-slate-500 mt-0.5 font-medium flex items-center gap-1">
                            🛡️ <strong>Pharmacy Margins Protected:</strong> The clinic owner has locked medicine discounts for counter staff. (Owner toggle required to unlock).
                          </p>
                        ) : (
                          <p className="text-[11px] text-emerald-800 mt-0.5 font-medium flex items-center gap-1">
                            🛡️ <strong>Medicine Margins Protected:</strong> 0% discount on medicines (₹{medicinesSubtotal.toFixed(2)} full price). Discount applies strictly to Consultation & Procedure fees (₹{servicesSubtotal.toFixed(2)} eligible).
                          </p>
                        )}
                      </div>
                    </label>
                  </div>

                  {discountError && (
                    <p className="text-[11px] font-semibold text-rose-600 mt-1.5 flex items-center gap-1">
                      ⚠️ {discountError}
                    </p>
                  )}
                </div>

                {basketGst > 0 && (
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>{pricesIncludeTax ? "GST included in prices" : "GST added"} (CGST + SGST)</span>
                    <span>₹{basketGst.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center text-lg font-bold text-slate-900 pt-1 border-t border-dashed border-slate-200">
                  <span>Net Grand Total</span>
                  <span className="text-2xl text-teal-800">₹{payableTotal.toFixed(2)}</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 bg-slate-50 rounded-lg p-3 border border-slate-200">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-600">Payment:</span>
                      <select
                        className="rounded border border-slate-300 bg-white p-1.5 text-xs font-semibold"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                      >
                        <option value="UPI">UPI / QR Code</option>
                        <option value="CARD">Credit / Debit Card</option>
                        <option value="CASH">Cash at Counter</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-600">WhatsApp To:</span>
                      <input
                        type="tel"
                        placeholder="10-digit mobile"
                        value={invoiceCustomPhone}
                        onChange={(e) => {
                          setWhatsappPhoneEdited(true);
                          setInvoiceCustomPhone(e.target.value);
                        }}
                        className="w-36 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none"
                        title="Auto-filled from owner profile; edit if the customer gives a different WhatsApp number"
                        aria-label="WhatsApp number for invoice"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      id="btn-pos-send-whatsapp"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shadow-2xs"
                      onClick={() => handleSendInvoiceWhatsApp(issuedInvoice)}
                      disabled={waSending || !issuedInvoice}
                    >
                      <MessageSquare className="h-4 w-4" />
                      <span>{waSending ? "Sending…" : "⚡ Send Invoice on WhatsApp"}</span>
                    </Button>

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
                      <div className="flex items-center gap-2">
                        <Button
                          id="btn-collect-payment"
                          size="sm"
                          className="bg-teal-700 hover:bg-teal-800 text-white font-bold"
                          onClick={() => payUnifiedInvoiceMutation.mutate()}
                          disabled={payUnifiedInvoiceMutation.isPending}
                        >
                          {payUnifiedInvoiceMutation.isPending ? "Recording…" : `Collect ₹${issuedInvoice.total} (${paymentMethod})`}
                        </Button>
                        <Button
                          id="btn-print-pos-invoice"
                          size="sm"
                          variant="outline"
                          onClick={() => setPosPrintOpen(true)}
                          className="flex items-center gap-1.5 border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          Print Receipt
                        </Button>
                      </div>
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
              Lookup existing registered clients or enter a new walk-in patient directly to issue an immediate queue token.
            </p>
          </div>

          {/* SMART LOOKUP / FETCH BAR */}
          <div className="rounded-xl bg-teal-50/70 border border-teal-200 p-4 relative">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="quick-client-search" className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                <span className="text-base">🔍</span>
                <span>Lookup Existing Registered Client / Pet (Optional)</span>
              </label>
              {selectedExistingClientId && (
                <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                  <span>✓ Existing Client Linked</span>
                  <button
                    type="button"
                    onClick={clearExistingClient}
                    className="text-emerald-700 hover:text-emerald-950 font-extrabold ml-1"
                    title="Clear and register new"
                  >
                    ✕
                  </button>
                </span>
              )}
            </div>
            <p className="text-xs text-teal-700 mt-1">
              Start typing a client name, phone number, or pet name to fetch their record. If they are new to the clinic, simply enter details in the fields below!
            </p>
            <div className="relative mt-2.5">
              <input
                id="quick-client-search"
                type="text"
                placeholder="Type to search (e.g. Nagesh, 7093365892, chitti)…"
                className="w-full rounded-lg border border-teal-300 bg-white p-2.5 text-sm shadow-xs focus:border-teal-600 focus:ring-1 focus:ring-teal-600 focus:outline-none"
                value={clientSearchQuery}
                onChange={(e) => {
                  setClientSearchQuery(e.target.value);
                  setShowClientSuggestions(true);
                }}
                onFocus={() => setShowClientSuggestions(true)}
              />

              {showClientSuggestions && clientSearchQuery.trim().length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl z-30 divide-y divide-slate-100">
                  {matchingClients.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500 text-center">
                      <p className="font-semibold text-slate-700">No registered client found for "{clientSearchQuery}"</p>
                      <p className="text-teal-700 font-medium mt-1">
                        You can fill out the form below directly to register them as a new client!
                      </p>
                    </div>
                  ) : (
                    matchingClients.map((c) => {
                      const clientPets = (patients.data ?? []).filter((p) => p.clientId === c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectExistingClient(c)}
                          className="w-full text-left p-3 hover:bg-teal-50 transition flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{c.displayName}</p>
                            <p className="text-slate-500 text-xs mt-0.5">Phone: {c.phone || "N/A"}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-semibold text-teal-800 bg-teal-100 px-2 py-0.5 rounded-full">
                              {clientPets.length > 0 ? `Pets: ${clientPets.map((p) => p.name).join(", ")}` : "No pets linked"}
                            </span>
                            <p className="text-[11px] text-teal-700 font-bold mt-1">Select & Load →</p>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {selectedExistingClientId && existingClientPets.length > 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <label className="text-xs font-bold text-slate-800">Select Pet for this Consultation *</label>
              <select
                className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm font-semibold bg-white text-slate-900"
                value={selectedExistingPatientId || "__NEW__"}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__NEW__") {
                    setSelectedExistingPatientId(null);
                    setRegPetName("");
                  } else {
                    setSelectedExistingPatientId(val);
                    const pet = existingClientPets.find((p) => p.id === val);
                    if (pet) {
                      setRegPetName(pet.name);
                      setRegSpecies(pet.speciesCode);
                    }
                  }
                }}
              >
                {existingClientPets.map((p) => (
                  <option key={p.id} value={p.id}>
                    🐾 {p.name} ({p.speciesCode})
                  </option>
                ))}
                <option value="__NEW__">+ Add a New Pet for {regClientName}</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">Client / Owner Name *</label>
              <input
                id="reg-client-name"
                type="text"
                placeholder="e.g. John Doe"
                className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm"
                value={regClientName}
                onChange={(e) => {
                  setRegClientName(e.target.value);
                  if (selectedExistingClientId) setSelectedExistingClientId(null);
                }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Phone Number *</label>
              <input
                id="reg-client-phone"
                type="tel"
                inputMode="numeric"
                placeholder="e.g. 9876543210"
                className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm"
                value={regClientPhone}
                onChange={(e) => setRegClientPhone(e.target.value.replace(/[^0-9+]/g, "").slice(0, 15))}
              />
            </div>
            <div>
              <label htmlFor="reg-client-category" className="text-xs font-semibold text-slate-600 flex items-center justify-between">
                <span>Customer Category</span>
                <span className="text-[10px] text-teal-700 font-bold">Pricing Tier</span>
              </label>
              <select
                id="reg-client-category"
                className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm font-medium bg-white"
                value={regCategory}
                onChange={(e) => setRegCategory(e.target.value as ClientCategory)}
              >
                <option value="STANDARD">Standard Client (Regular)</option>
                <option value="LOYAL">⭐ Loyal Customer (Up to {loyalDiscountCap}% cap)</option>
                <option value="NGO">🐾 NGO / Stray Rescue ({ngoConsultationDiscountPercent}% Consultation)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">Pet Name *</label>
              <input
                id="reg-pet-name"
                type="text"
                placeholder="e.g. Bruno"
                className="mt-1 w-full rounded-md border border-slate-300 p-2.5 text-sm font-semibold"
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
            <label className="text-xs font-semibold text-slate-600 flex items-center justify-between">
              <span>Assign Doctor *</span>
              <span className="text-[11px] text-teal-700 font-semibold">Real-Time Doctor Availability</span>
            </label>

            {/* Quick Doctor Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2">
              {doctorStats.map((d) => {
                const isSelected = regDoctorId === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setRegDoctorId(d.id)}
                    className={`rounded-lg border p-2.5 text-left transition-all ${
                      isSelected
                        ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600 shadow-2xs"
                        : d.isConsulting
                        ? "border-slate-200 bg-slate-50/70 hover:bg-slate-100"
                        : "border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 shadow-2xs"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-900 truncate">{d.displayName}</p>
                      {d.isConsulting ? (
                        <span className="text-[9px] font-bold text-rose-700 bg-rose-100 border border-rose-200 px-1.5 py-0.2 rounded-full">
                          Busy
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 rounded-full">
                          🟢 Free
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {d.isConsulting
                        ? `With ${d.consultingPatient?.name || "Patient"}`
                        : `${d.waitingCount} waiting in queue`}
                    </p>
                  </button>
                );
              })}
            </div>

            <select
              id="reg-doctor-select"
              className="mt-2.5 w-full rounded-md border border-slate-300 p-2.5 text-sm"
              value={regDoctorId}
              onChange={(e) => setRegDoctorId(e.target.value)}
            >
              <option value="">Select attending doctor…</option>
              {doctorStats.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName} — {d.isConsulting ? `🔴 BUSY (In Consult with ${d.consultingPatient?.name || "Patient"})` : `🟢 FREE NOW (${d.waitingCount} waiting)`}
                </option>
              ))}
            </select>

            {/* Hint if selected doctor is busy */}
            {(() => {
              const selectedDocStat = doctorStats.find((d) => d.id === regDoctorId);
              const freeDoc = doctorStats.find((d) => d.isFree && d.waitingCount === 0);
              if (selectedDocStat?.isConsulting) {
                return (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 mt-2 flex flex-wrap items-center justify-between gap-1">
                    <span>
                      ⚠️ <strong>{selectedDocStat.displayName}</strong> is currently with <strong>{selectedDocStat.consultingPatient?.name || "Patient"}</strong>.
                    </span>
                    {freeDoc && (
                      <button
                        type="button"
                        onClick={() => setRegDoctorId(freeDoc.id)}
                        className="font-bold underline text-teal-800"
                      >
                        Switch to {freeDoc.displayName} (Free Now) →
                      </button>
                    )}
                  </div>
                );
              }
              return null;
            })()}
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
              className="bg-teal-700 hover:bg-teal-800 text-white font-bold"
              onClick={() => executeWalkInRegistration.mutate()}
              disabled={executeWalkInRegistration.isPending || !regClientName || !regPetName || !regDoctorId}
            >
              {executeWalkInRegistration.isPending
                ? "Processing…"
                : selectedExistingPatientId
                ? "Check In & Issue Queue Token ✓"
                : "Register & Issue Queue Token ✓"}
            </Button>
          </div>
        </div>
      )}

      {/* RECORD SOAP CONSULTATION MODAL */}
      <RecordSoapModal
        isOpen={soapModalOpen}
        onClose={() => setSoapModalOpen(false)}
        initialPatientId={soapModalPatientId}
        initialAppointmentId={soapModalApptId}
      />

      {(issuedInvoice || completedReceipt) && (
        <PrintableDocumentModal
          isOpen={posPrintOpen}
          onClose={() => setPosPrintOpen(false)}
          documentType="INVOICE"
          invoiceId={issuedInvoice?.id || completedReceipt?.invoiceId}
          invoiceData={{
            invoiceNumber: issuedInvoice?.invoiceNumber || completedReceipt?.invoiceNumber || "",
            invoiceDate: completedReceipt?.dateStr || new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
            clientName: completedReceipt?.clientName || clients.data?.find((c) => c.id === basketClientId || (activePatientId && c.id === patients.data?.find((p) => p.id === activePatientId)?.clientId))?.displayName || "Clinic Walk-In Client",
            clientPhone: completedReceipt?.clientPhone || clients.data?.find((c) => c.id === basketClientId || (activePatientId && c.id === patients.data?.find((p) => p.id === activePatientId)?.clientId))?.phone || "",
            petName: completedReceipt?.petName || patients.data?.find((p) => p.id === activePatientId)?.name,
            lines: completedReceipt?.lines && completedReceipt.lines.length > 0
              ? completedReceipt.lines
              : (issuedInvoice?.lines && issuedInvoice.lines.length > 0)
              ? invoiceLinesForPrint(issuedInvoice.lines)
              : basketLines.map((b) => ({
                  description: b.description,
                  quantity: b.quantity,
                  unitPrice: b.unitPrice,
                  total: b.quantity * b.unitPrice,
                })),
            subtotal:
              completedReceipt?.subtotal ??
              (issuedInvoice?.subtotal !== undefined ? Number(issuedInvoice.subtotal) : undefined) ??
              (completedReceipt?.total || Number(issuedInvoice?.total) || basketLines.reduce((acc, b) => acc + b.quantity * b.unitPrice, 0)),
            taxAmount: completedReceipt?.taxTotal ?? Number(issuedInvoice?.taxTotal ?? 0),
            grandTotal: completedReceipt?.total || Number(issuedInvoice?.total) || basketLines.reduce((acc, b) => acc + b.quantity * b.unitPrice, 0),
            paymentStatus: completedReceipt ? "PAID" : (issuedInvoice?.status === "PAID" ? "PAID" : "PENDING"),
            paymentMethod: completedReceipt?.paymentMethod || paymentMethod,
          }}
        />
      )}

      {/* Modal: Administer / Log Vaccine */}
      {showVaxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-teal-100 p-2 text-teal-800">
                  <Syringe className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Administer / Record Vaccine
                  </h3>
                  <p className="text-xs text-slate-500">
                    Patient: <strong>{activePatient?.name || "Patient"}</strong> ({activePatient?.speciesCode || "Canine"})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVaxModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Select or Enter Vaccine *</label>
                <div className="mt-1 flex flex-wrap gap-1.5 mb-2">
                  {(isFeline
                    ? ["Rabies (Anti-Rabies / ARV)", "Tricat Trio (FVRCP)", "FeLV (Feline Leukemia)", "Deworming (Feline)"]
                    : ["Rabies (Anti-Rabies / ARV)", "DHPPiL (9-in-1 Core)", "Kennel Cough (KC / Bordetella)", "Deworming (Broad Spectrum)"]
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSelectVaxType(preset)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition ${
                        vaxName === preset
                          ? "bg-teal-700 text-white border-teal-800 shadow-xs"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={vaxName}
                  onChange={(e) => setVaxName(e.target.value)}
                  placeholder="e.g. Rabies (Nobivac R), DHPPiL, etc."
                  className="w-full rounded-md border border-slate-300 p-2 text-xs font-semibold text-slate-800 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Administered On (Date) *</label>
                  <input
                    type="date"
                    value={vaxAdminDate}
                    onChange={(e) => setVaxAdminDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Next Booster Due On</label>
                  <input
                    type="date"
                    value={vaxNextDue}
                    onChange={(e) => setVaxNextDue(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700">Batch / Lot Number</label>
                  <input
                    type="text"
                    value={vaxBatch}
                    onChange={(e) => setVaxBatch(e.target.value)}
                    placeholder="e.g. RB-2026-X1"
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700">Fee to Bill Client (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={vaxFee}
                    onChange={(e) => setVaxFee(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs font-bold text-teal-900"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700">Clinical Route & Notes</label>
                <input
                  type="text"
                  value={vaxNotes}
                  onChange={(e) => setVaxNotes(e.target.value)}
                  placeholder="e.g. Subcutaneous right hindquarter. No adverse reaction."
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="rounded-lg bg-teal-50 border border-teal-200 p-3">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-teal-950">
                  <input
                    type="checkbox"
                    checked={vaxAddToBasket}
                    onChange={(e) => setVaxAddToBasket(e.target.checked)}
                    className="h-4 w-4 rounded border-teal-300 text-teal-700 focus:ring-teal-500"
                  />
                  <span>Automatically add ₹{vaxFee || "0"} Vaccine Charge to Invoice Basket</span>
                </label>
                <p className="text-[11px] text-teal-800 ml-6 mt-0.5">
                  Sends the vaccine fee directly to POS billing checkout so the counter receptionist can collect payment without re-typing.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowVaxModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-teal-700 hover:bg-teal-800 text-white font-bold"
                disabled={!vaxName.trim() || recordVaccineMutation.isPending}
                onClick={() => recordVaccineMutation.mutate()}
              >
                {recordVaccineMutation.isPending ? "Recording…" : "Save to Immunization Card ✓"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
