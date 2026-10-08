"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useTransition } from "react";
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
  type PatientRow,
  type ClientRow,
  type PatientTimeline,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function PatientsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const initialPatientId = searchParams.get("selected");

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(initialPatientId);
  const [filterQuery, setFilterQuery] = useState("");
  const [showNewOwnerModal, setShowNewOwnerModal] = useState(false);
  const [showNewPetModal, setShowNewPetModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState<"DEWORMING" | "VACCINATION" | "LAB" | null>(null);

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
    const q = filterQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.speciesCode.toLowerCase().includes(q);
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
            placeholder="Filter pets by name or species…"
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
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPatientId(p.id)}
                    className={`w-full text-left rounded-lg p-3 transition border ${
                      active
                        ? "bg-teal-50 border-teal-500 shadow-sm"
                        : "border-slate-100 bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">{p.name}</p>
                      <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800 uppercase">
                        {p.speciesCode}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Size: {p.sizeCategory}
                    </p>
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
              {/* Patient Banner */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-extrabold text-slate-900">{timelineQuery.data.patient.name}</h3>
                      <span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800 uppercase">
                        {timelineQuery.data.patient.speciesCode}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Owner: <span className="font-semibold text-slate-800">{timelineQuery.data.client.displayName}</span> • Phone: {timelineQuery.data.client.phone || "N/A"}
                    </p>
                  </div>
                    <div className="flex gap-2">
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
                  </div>
                </div>
              </div>

              {/* Timeline Items */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-4">
                  Medical Record Chronology ({timelineQuery.data.events.length} Events)
                </h4>

                {timelineQuery.data.events.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">
                    No clinical history recorded yet for this patient.
                  </p>
                ) : (
                  <div className="relative border-l-2 border-teal-100 ml-3 space-y-6">
                    {timelineQuery.data.events.map((ev) => {
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
                            <div className="mt-2">
                              <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                                Status: {ev.status}
                              </span>
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
                  type="text"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="+1 555-0199"
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
    </div>
  );
}
