"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  listPatients,
  listLabOrders,
  createLabOrder,
  updateLabStatus,
  listSurgeries,
  scheduleSurgery,
  updateSurgeryStatus,
  listAdmissions,
  admitPatient,
  dischargePatient,
  listGrooming,
  bookGrooming,
  updateGroomingStatus,
  type PatientRow,
  type LabOrder,
  type SurgeryRecord,
  type AdmissionRecord,
  type GroomingRecord,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Paperclip, ShoppingCart } from "lucide-react";
import { FileAttachmentsModal } from "@/components/file-attachments-modal";

const GROOMING_TIER_RATES = {
  SMALL: 600,
  MEDIUM: 1000,
  LARGE: 1500,
  GIANT: 2000,
} as const;

export default function SpecialtiesPage() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"LABS" | "SURGERIES" | "IPD" | "GROOMING">("LABS");

  // Modals
  const [showLabModal, setShowLabModal] = useState(false);
  const [showSurgeryModal, setShowSurgeryModal] = useState(false);
  const [showAdmitModal, setShowAdmitModal] = useState(false);
  const [showGroomingModal, setShowGroomingModal] = useState(false);
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [attachLabOrder, setAttachLabOrder] = useState<LabOrder | null>(null);

  // Forms
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [testName, setTestName] = useState("");
  const [labCharge, setLabCharge] = useState("500");

  const [procedureName, setProcedureName] = useState("");
  const [surgeryCharge, setSurgeryCharge] = useState("3500");
  const [scheduledAt, setScheduledAt] = useState(new Date().toISOString().slice(0, 16));

  const [dailyRate, setDailyRate] = useState("800");

  const [dogSize, setDogSize] = useState<"SMALL" | "MEDIUM" | "LARGE" | "GIANT">("MEDIUM");
  const [groomingCharge, setGroomingCharge] = useState("1000");
  const [groomingNotes, setGroomingNotes] = useState("");

  // Queries
  const patientsQuery = useQuery<PatientRow[]>({
    queryKey: ["patients"],
    queryFn: () => listPatients(),
  });

  const labsQuery = useQuery<LabOrder[]>({
    queryKey: ["specialties-labs"],
    queryFn: () => listLabOrders(),
  });

  const surgeriesQuery = useQuery<SurgeryRecord[]>({
    queryKey: ["specialties-surgeries"],
    queryFn: () => listSurgeries(),
  });

  const admissionsQuery = useQuery<AdmissionRecord[]>({
    queryKey: ["specialties-admissions"],
    queryFn: () => listAdmissions(),
  });

  const groomingQuery = useQuery<GroomingRecord[]>({
    queryKey: ["specialties-grooming"],
    queryFn: () => listGrooming(),
  });

  // Basket action
  function sendSpecialtyToBasket(item: { id: string; description: string; unitPrice: number; patientId?: string }) {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("vetos_active_basket");
    const currentLines = raw ? JSON.parse(raw) : [];
    const newLine = {
      id: item.id,
      sourceType: "SERVICE",
      description: item.description,
      quantity: 1,
      unitPrice: Number(item.unitPrice || 0),
      taxRate: 0,
    };
    localStorage.setItem("vetos_active_basket", JSON.stringify([...currentLines, newLine]));
    if (item.patientId) {
      localStorage.setItem("vetos_active_basket_patient_id", item.patientId);
    }
    router.push("/clinic");
  }

  function handleSelectPatientForGrooming(pId: string) {
    setSelectedPatientId(pId);
    const pat = patientsQuery.data?.find((p) => p.id === pId);
    if (pat?.sizeCategory && pat.sizeCategory in GROOMING_TIER_RATES) {
      const sz = pat.sizeCategory as keyof typeof GROOMING_TIER_RATES;
      setDogSize(sz);
      setGroomingCharge(String(GROOMING_TIER_RATES[sz]));
    }
  }

  function handleDogSizeChange(newSize: "SMALL" | "MEDIUM" | "LARGE" | "GIANT") {
    setDogSize(newSize);
    setGroomingCharge(String(GROOMING_TIER_RATES[newSize]));
  }

  // Mutations
  const createLabMutation = useMutation({
    mutationFn: () =>
      createLabOrder({
        patientId: selectedPatientId,
        testName,
        chargeAmount: parseFloat(labCharge) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specialties-labs"] });
      setShowLabModal(false);
      setSelectedPatientId("");
      setTestName("");
      setLabCharge("500");
    },
  });

  const updateLabMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateLabStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["specialties-labs"] }),
  });

  const scheduleSurgeryMutation = useMutation({
    mutationFn: () =>
      scheduleSurgery({
        patientId: selectedPatientId,
        procedureName,
        scheduledAt: new Date(scheduledAt).toISOString(),
        chargeAmount: parseFloat(surgeryCharge) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specialties-surgeries"] });
      setShowSurgeryModal(false);
      setSelectedPatientId("");
      setProcedureName("");
      setSurgeryCharge("3500");
    },
  });

  const updateSurgeryMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateSurgeryStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["specialties-surgeries"] }),
  });

  const admitMutation = useMutation({
    mutationFn: () =>
      admitPatient({
        patientId: selectedPatientId,
        dailyRate: parseFloat(dailyRate) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specialties-admissions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      setShowAdmitModal(false);
      setSelectedPatientId("");
      setDailyRate("800");
    },
  });

  const dischargeMutation = useMutation({
    mutationFn: (id: string) => dischargePatient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specialties-admissions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
    },
  });

  const bookGroomingMutation = useMutation({
    mutationFn: () =>
      bookGrooming({
        patientId: selectedPatientId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        dogSize,
        chargeAmount: parseFloat(groomingCharge) || 0,
        notes: groomingNotes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specialties-grooming"] });
      setShowGroomingModal(false);
      setSelectedPatientId("");
      setGroomingNotes("");
      setDogSize("MEDIUM");
      setGroomingCharge("1000");
    },
  });

  const updateGroomingMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateGroomingStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["specialties-grooming"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Clinical Specialties & In-Patient Units</h2>
          <p className="text-xs text-slate-500">Diagnostic pathology labs, operating room surgeries, IPD wards, and dog grooming with billable fees</p>
        </div>
        <div>
          {activeTab === "LABS" && (
            <Button
              type="button"
              className="bg-purple-800 text-white hover:bg-purple-900"
              size="sm"
              onClick={() => setShowLabModal(true)}
            >
              + Order Lab Diagnostic
            </Button>
          )}
          {activeTab === "SURGERIES" && (
            <Button
              type="button"
              className="bg-rose-800 text-white hover:bg-rose-900"
              size="sm"
              onClick={() => setShowSurgeryModal(true)}
            >
              + Schedule Surgical Procedure
            </Button>
          )}
          {activeTab === "IPD" && (
            <Button
              type="button"
              className="bg-indigo-800 text-white hover:bg-indigo-900"
              size="sm"
              onClick={() => setShowAdmitModal(true)}
            >
              + Admit Patient (IPD Ward)
            </Button>
          )}
          {activeTab === "GROOMING" && (
            <Button
              type="button"
              className="bg-teal-800 text-white hover:bg-teal-900"
              size="sm"
              onClick={() => setShowGroomingModal(true)}
            >
              + Book Grooming Session
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("LABS")}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeTab === "LABS" ? "border-purple-700 text-purple-800" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Diagnostic Labs ({labsQuery.data?.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("SURGERIES")}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeTab === "SURGERIES" ? "border-rose-700 text-rose-800" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Surgeries ({surgeriesQuery.data?.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("IPD")}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeTab === "IPD" ? "border-indigo-700 text-indigo-800" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Hospitalization / IPD ({admissionsQuery.data?.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("GROOMING")}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeTab === "GROOMING" ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Grooming & Spa ({groomingQuery.data?.length ?? 0})
        </button>
      </div>

      {/* Tab 1: LABS */}
      {activeTab === "LABS" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600">
                <tr>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Test / Diagnostic Panel</th>
                  <th className="p-3">Fee (₹)</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Ordered Date</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {labsQuery.isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-400">Loading lab orders…</td>
                  </tr>
                ) : (labsQuery.data || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">No lab diagnostics ordered yet.</td>
                  </tr>
                ) : (
                  (labsQuery.data || []).map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{l.patientName}</td>
                      <td className="p-3 font-semibold text-purple-900">{l.testName}</td>
                      <td className="p-3 font-bold text-slate-900">₹{Number(l.chargeAmount || 0).toFixed(2)}</td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            l.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : l.status === "IN_PROGRESS"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{new Date(l.orderedAt).toLocaleString()}</td>
                      <td className="p-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAttachLabOrder(l);
                            setAttachModalOpen(true);
                          }}
                          className="flex items-center gap-1 rounded bg-purple-50 px-2 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition shadow-2xs"
                        >
                          <Paperclip className="h-3 w-3" />
                          Reports
                        </button>
                        {l.status === "ORDERED" && (
                          <button
                            type="button"
                            onClick={() => updateLabMutation.mutate({ id: l.id, status: "IN_PROGRESS" })}
                            className="rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            In Progress
                          </button>
                        )}
                        {l.status !== "COMPLETED" && (
                          <button
                            type="button"
                            onClick={() => updateLabMutation.mutate({ id: l.id, status: "COMPLETED" })}
                            className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            Complete
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            sendSpecialtyToBasket({
                              id: `lab-${l.id}`,
                              description: `Lab Diagnostic: ${l.testName} (${l.patientName})`,
                              unitPrice: l.chargeAmount || 0,
                              patientId: l.patientId,
                            })
                          }
                          className="flex items-center gap-1 rounded bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100 transition"
                          title="Add charge directly into Unified POS Basket"
                        >
                          <ShoppingCart className="h-3 w-3" />
                          Send to Bill
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: SURGERIES */}
      {activeTab === "SURGERIES" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600">
                <tr>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Procedure Name</th>
                  <th className="p-3">Fee (₹)</th>
                  <th className="p-3">Scheduled At</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {surgeriesQuery.isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-400">Loading surgeries…</td>
                  </tr>
                ) : (surgeriesQuery.data || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">No surgeries scheduled yet.</td>
                  </tr>
                ) : (
                  (surgeriesQuery.data || []).map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{s.patientName}</td>
                      <td className="p-3 font-semibold text-rose-900">{s.procedureName}</td>
                      <td className="p-3 font-bold text-slate-900">₹{Number(s.chargeAmount || 0).toFixed(2)}</td>
                      <td className="p-3 text-slate-500">{new Date(s.scheduledAt).toLocaleString()}</td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            s.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : s.status === "CANCELLED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="p-3 flex items-center gap-2">
                        {s.status === "SCHEDULED" && (
                          <button
                            type="button"
                            onClick={() => updateSurgeryMutation.mutate({ id: s.id, status: "COMPLETED" })}
                            className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            Mark Completed
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            sendSpecialtyToBasket({
                              id: `surgery-${s.id}`,
                              description: `Surgery: ${s.procedureName} (${s.patientName})`,
                              unitPrice: s.chargeAmount || 0,
                              patientId: s.patientId,
                            })
                          }
                          className="flex items-center gap-1 rounded bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100 transition"
                          title="Add surgery fee directly into Unified POS Basket"
                        >
                          <ShoppingCart className="h-3 w-3" />
                          Send to Bill
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: IPD */}
      {activeTab === "IPD" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600">
                <tr>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Admitted At</th>
                  <th className="p-3">Discharged At</th>
                  <th className="p-3">Daily Rate (₹)</th>
                  <th className="p-3">Total Charge (₹)</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admissionsQuery.isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-400">Loading admissions…</td>
                  </tr>
                ) : (admissionsQuery.data || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">No patients currently in IPD ward.</td>
                  </tr>
                ) : (
                  (admissionsQuery.data || []).map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{a.patientName}</td>
                      <td className="p-3 text-slate-500">{new Date(a.admittedAt).toLocaleString()}</td>
                      <td className="p-3 text-slate-500">
                        {a.dischargedAt ? new Date(a.dischargedAt).toLocaleString() : "Still Hospitalized"}
                      </td>
                      <td className="p-3 font-medium text-slate-700">₹{Number(a.dailyRate || 0).toFixed(2)}/day</td>
                      <td className="p-3 font-bold text-indigo-900">
                        ₹{Number(a.totalCharge || a.dailyRate || 0).toFixed(2)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            a.status === "ADMITTED" ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="p-3 flex items-center gap-2">
                        {a.status === "ADMITTED" && (
                          <button
                            type="button"
                            onClick={() => dischargeMutation.mutate(a.id)}
                            className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            Discharge & Calculate Total
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            sendSpecialtyToBasket({
                              id: `ipd-${a.id}`,
                              description: `IPD Hospitalization: ${a.patientName} (${a.status === "ADMITTED" ? "Active" : "Discharged"})`,
                              unitPrice: a.totalCharge || a.dailyRate || 0,
                              patientId: a.patientId,
                            })
                          }
                          className="flex items-center gap-1 rounded bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100 transition"
                          title="Add IPD charges directly into Unified POS Basket"
                        >
                          <ShoppingCart className="h-3 w-3" />
                          Send to Bill
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: GROOMING */}
      {activeTab === "GROOMING" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600">
                <tr>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Dog Size Tier</th>
                  <th className="p-3">Grooming Fee (₹)</th>
                  <th className="p-3">Scheduled At</th>
                  <th className="p-3">Notes</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groomingQuery.isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-400">Loading grooming bookings…</td>
                  </tr>
                ) : (groomingQuery.data || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">No grooming sessions scheduled yet.</td>
                  </tr>
                ) : (
                  (groomingQuery.data || []).map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{g.patientName}</td>
                      <td className="p-3">
                        <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                          {g.dogSize || "MEDIUM"}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-900">₹{Number(g.chargeAmount || 0).toFixed(2)}</td>
                      <td className="p-3 text-slate-500">{new Date(g.scheduledAt).toLocaleString()}</td>
                      <td className="p-3 text-slate-600">{g.notes || "Standard Bath & Haircut"}</td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            g.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800"
                              : g.status === "CANCELLED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-teal-100 text-teal-800"
                          }`}
                        >
                          {g.status}
                        </span>
                      </td>
                      <td className="p-3 flex items-center gap-2">
                        {g.status === "SCHEDULED" && (
                          <button
                            type="button"
                            onClick={() => updateGroomingMutation.mutate({ id: g.id, status: "COMPLETED" })}
                            className="rounded bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                          >
                            Mark Completed
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            sendSpecialtyToBasket({
                              id: `grooming-${g.id}`,
                              description: `Grooming [${g.dogSize}]: ${g.patientName}`,
                              unitPrice: g.chargeAmount || 0,
                              patientId: g.patientId,
                            })
                          }
                          className="flex items-center gap-1 rounded bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700 hover:bg-teal-100 transition"
                          title="Add grooming fee directly into Unified POS Basket"
                        >
                          <ShoppingCart className="h-3 w-3" />
                          Send to Bill
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Order Lab */}
      {showLabModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Order Diagnostic Pathology Lab</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Patient *</label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                >
                  <option value="">Select patient…</option>
                  {(patientsQuery.data || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.speciesCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Test / Diagnostic Panel *</label>
                <input
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Complete Blood Count (CBC) or Urinalysis"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Diagnostic Fee / Charge (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={labCharge}
                  onChange={(e) => setLabCharge(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-semibold"
                  placeholder="500.00"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowLabModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-purple-800 text-white"
                disabled={!selectedPatientId || !testName || createLabMutation.isPending}
                onClick={() => createLabMutation.mutate()}
              >
                {createLabMutation.isPending ? "Ordering…" : "Submit Order"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Schedule Surgery */}
      {showSurgeryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Schedule Surgical Procedure</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Patient *</label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                >
                  <option value="">Select patient…</option>
                  {(patientsQuery.data || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.speciesCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Procedure Name *</label>
                <input
                  type="text"
                  value={procedureName}
                  onChange={(e) => setProcedureName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Ovariohysterectomy (Spay) or Orthopedic Fixation"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Procedure Fee (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={surgeryCharge}
                    onChange={(e) => setSurgeryCharge(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-semibold"
                    placeholder="3500.00"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowSurgeryModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-rose-800 text-white"
                disabled={!selectedPatientId || !procedureName || scheduleSurgeryMutation.isPending}
                onClick={() => scheduleSurgeryMutation.mutate()}
              >
                {scheduleSurgeryMutation.isPending ? "Scheduling…" : "Schedule Surgery"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Admit IPD */}
      {showAdmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Admit Patient to IPD Ward</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Patient *</label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                >
                  <option value="">Select patient…</option>
                  {(patientsQuery.data || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.speciesCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Daily Ward Hospitalization Rate (₹/day) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={dailyRate}
                  onChange={(e) => setDailyRate(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-semibold"
                  placeholder="800.00"
                />
                <p className="mt-1 text-[11px] text-slate-400">Total charge will be auto-calculated upon discharge based on days hospitalized.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAdmitModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-indigo-800 text-white"
                disabled={!selectedPatientId || admitMutation.isPending}
                onClick={() => admitMutation.mutate()}
              >
                {admitMutation.isPending ? "Admitting…" : "Admit to Ward"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Grooming */}
      {showGroomingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Book Grooming / Spa Session</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Patient *</label>
                <select
                  value={selectedPatientId}
                  onChange={(e) => handleSelectPatientForGrooming(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                >
                  <option value="">Select patient…</option>
                  {(patientsQuery.data || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.speciesCode}{p.sizeCategory ? ` • ${p.sizeCategory}` : ""})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Dog Size Tier *</label>
                  <span className="text-[10px] text-teal-700 font-medium">Auto-detected from pet profile</span>
                </div>
                <select
                  value={dogSize}
                  onChange={(e) => handleDogSizeChange(e.target.value as "SMALL" | "MEDIUM" | "LARGE" | "GIANT")}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-semibold"
                >
                  <option value="SMALL">Small Dog (₹600) — Pug, Shih Tzu, Chihuahua</option>
                  <option value="MEDIUM">Medium Dog (₹1,000) — Beagle, Cocker Spaniel, Frenchie</option>
                  <option value="LARGE">Large Dog (₹1,500) — Golden Retriever, German Shepherd, Labrador</option>
                  <option value="GIANT">Giant Dog (₹2,000) — Great Dane, Saint Bernard, Mastiff</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Grooming Fee (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={groomingCharge}
                    onChange={(e) => setGroomingCharge(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-bold text-teal-800"
                    placeholder="1000.00"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Special Notes</label>
                <input
                  type="text"
                  value={groomingNotes}
                  onChange={(e) => setGroomingNotes(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Medicated shampoo, nail clip, ear cleaning"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowGroomingModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white"
                disabled={!selectedPatientId || bookGroomingMutation.isPending}
                onClick={() => bookGroomingMutation.mutate()}
              >
                {bookGroomingMutation.isPending ? "Booking…" : "Confirm Booking"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {attachLabOrder && (
        <FileAttachmentsModal
          isOpen={attachModalOpen}
          onClose={() => {
            setAttachModalOpen(false);
            setAttachLabOrder(null);
          }}
          entityType="LAB_ORDER"
          entityId={attachLabOrder.id}
          title={`Lab Diagnostic: ${attachLabOrder.testName}`}
          subtitle={`Patient: ${attachLabOrder.patientName} • Diagnostic Pathology Results`}
        />
      )}
    </div>
  );
}
