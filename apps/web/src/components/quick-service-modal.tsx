"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap, X, Check, CheckCircle2, AlertCircle, Plus, Trash2 } from "lucide-react";
import { listPatients, listClients, issueInvoice, type PatientRow, type ClientRow } from "@/lib/api";

type QuickServiceItem = {
  id: string;
  name: string;
  price: number;
  selected: boolean;
};

const DEFAULT_QUICK_SERVICES: QuickServiceItem[] = [
  { id: "ear_clean", name: "Ear Cleaning & Irrigation", price: 25.0, selected: false },
  { id: "nail_cut", name: "Nail Cutting & Trimming", price: 15.0, selected: false },
  { id: "deworm", name: "Deworming Administration", price: 30.0, selected: false },
  { id: "hygiene_bath", name: "Hygienic Medicated Bath", price: 40.0, selected: false },
  { id: "dental_polish", name: "Dental Hygiene Polish", price: 20.0, selected: false },
];

export function QuickServiceModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [services, setServices] = useState<QuickServiceItem[]>(DEFAULT_QUICK_SERVICES);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [successInvoiceNumber, setSuccessInvoiceNumber] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const selectedPatient = patientsQuery.data?.find((p) => p.id === selectedPatientId);
  const matchingClient = selectedPatient
    ? clientsQuery.data?.find((c) => c.id === selectedPatient.clientId)
    : null;

  const toggleService = (id: string) => {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s))
    );
  };

  const addCustomService = () => {
    if (!customName.trim() || !customPrice || isNaN(Number(customPrice))) return;
    const newItem: QuickServiceItem = {
      id: "custom_" + Date.now(),
      name: customName.trim(),
      price: Math.max(0, Number(customPrice)),
      selected: true,
    };
    setServices((prev) => [...prev, newItem]);
    setCustomName("");
    setCustomPrice("");
  };

  const removeService = (id: string) => {
    setServices((prev) => prev.filter((s) => s.id !== id));
  };

  const selectedServices = services.filter((s) => s.selected);
  const totalAmount = selectedServices.reduce((sum, s) => sum + s.price, 0);

  const invoiceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatientId) {
        throw new Error("Please select a patient.");
      }
      if (selectedServices.length === 0) {
        throw new Error("Please select at least one quick service.");
      }

      const lines = selectedServices.map((s) => ({
        description: s.name,
        quantity: 1,
        unitPrice: s.price,
        sourceType: "SERVICE",
      }));

      return await issueInvoice({
        patientId: selectedPatientId,
        clientId: selectedPatient?.clientId,
        lines,
      });
    },
    onSuccess: (data) => {
      setSuccessInvoiceNumber(data.invoiceNumber || "INV-NEW");
      queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      queryClient.invalidateQueries({ queryKey: ["financial-overview"] });
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || "Failed to issue quick service invoice.");
    },
  });

  if (!isOpen) return null;

  const resetAndClose = () => {
    setSelectedPatientId("");
    setServices(DEFAULT_QUICK_SERVICES);
    setSuccessInvoiceNumber(null);
    setErrorMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 sm:p-7">
        <button
          onClick={resetAndClose}
          className="absolute right-5 top-5 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Zap className="h-5 w-5 fill-teal-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Quick Service (Walk-in)</h2>
            <p className="text-xs text-slate-500">
              No formal consultation required — charges added straight to billing.
            </p>
          </div>
        </div>

        {successInvoiceNumber ? (
          <div className="my-6 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Invoice Created Successfully!</h3>
              <p className="text-sm text-slate-600 mt-1">
                Invoice <span className="font-mono font-bold text-teal-700">{successInvoiceNumber}</span> has been added to billing basket.
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Total Billed: <span className="font-semibold text-slate-800">${totalAmount.toFixed(2)}</span>
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-3">
              <button
                onClick={resetAndClose}
                className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {errorMessage && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Select Patient */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select Patient / Pet *
              </label>
              <select
                value={selectedPatientId}
                onChange={(e) => {
                  setSelectedPatientId(e.target.value);
                  setErrorMessage(null);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-xs focus:border-teal-600 focus:outline-hidden focus:ring-1 focus:ring-teal-600"
              >
                <option value="">-- Choose registered patient --</option>
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
                <p className="mt-1 text-xs text-teal-700">
                  Owner: <span className="font-medium">{matchingClient.displayName}</span> ({matchingClient.phone || "No phone"})
                </p>
              )}
            </div>

            {/* Service Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Select Walk-in Services
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {services.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => toggleService(item.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-sm cursor-pointer transition ${
                      item.selected
                        ? "border-teal-600 bg-teal-50/50 text-teal-950 font-medium"
                        : "border-slate-200 bg-slate-50/50 text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          item.selected
                            ? "border-teal-600 bg-teal-600 text-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {item.selected && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                      <span>{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">${item.price.toFixed(2)}</span>
                      {item.id.startsWith("custom_") && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeService(item.id);
                          }}
                          className="text-slate-400 hover:text-rose-600 ml-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom service addition */}
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Custom service name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-600 focus:outline-hidden"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Price $"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
                className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-600 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={addCustomService}
                className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>

            {/* Footer Summary & Action */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <div>
                <p className="text-xs text-slate-500">Total Billed</p>
                <p className="text-xl font-extrabold text-slate-900">${totalAmount.toFixed(2)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={invoiceMutation.isPending || selectedServices.length === 0 || !selectedPatientId}
                  onClick={() => invoiceMutation.mutate()}
                  className="rounded-lg bg-teal-700 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 shadow-sm"
                >
                  {invoiceMutation.isPending ? "Issuing Bill…" : "Charge to Billing →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
