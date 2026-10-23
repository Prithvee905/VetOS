"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap, X, Check, CheckCircle2, AlertCircle, Plus, Trash2 } from "lucide-react";
import { listPatients, listClients, listServices, appendToBasket, type PatientRow, type ClientRow } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { gstOf } from "@/lib/pricing";

type CustomItem = { id: string; name: string; price: number };

export function QuickServiceModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [customItems, setCustomItems] = useState<CustomItem[]>([]);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [sentTotal, setSentTotal] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const patientsQuery = useQuery<PatientRow[]>({ queryKey: ["patients"], queryFn: () => listPatients(), enabled: isOpen });
  const clientsQuery = useQuery<ClientRow[]>({ queryKey: ["clients"], queryFn: listClients, enabled: isOpen });
  const servicesQuery = useQuery({ queryKey: ["services"], queryFn: listServices, enabled: isOpen });

  const catalog = useMemo(
    () => (servicesQuery.data ?? []).filter((s) => !s.status || s.status.toUpperCase() === "ACTIVE"),
    [servicesQuery.data]
  );

  const selectedPatient = patientsQuery.data?.find((p) => p.id === selectedPatientId);
  const matchingClient = selectedPatient ? clientsQuery.data?.find((c) => c.id === selectedPatient.clientId) : null;

  const chosenCatalog = catalog.filter((s) => selectedServiceIds.includes(s.id));
  const totalAmount =
    chosenCatalog.reduce((sum, s) => sum + (Number(s.defaultPrice) || 0), 0) +
    customItems.reduce((sum, item) => sum + item.price, 0);
  const itemCount = chosenCatalog.length + customItems.length;

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const addCustomService = () => {
    const price = Number(customPrice);
    if (!customName.trim() || !(price > 0)) return;
    setCustomItems((prev) => [...prev, { id: `custom_${Date.now()}`, name: customName.trim(), price }]);
    setCustomName("");
    setCustomPrice("");
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatientId) throw new Error("Please select a patient.");
      if (itemCount === 0) throw new Error("Please select at least one service.");
      const lines = [
        ...chosenCatalog.map((s) => ({
          id: `svc-${s.id}-${Date.now()}`,
          sourceType: "SERVICE",
          description: s.name,
          quantity: 1,
          unitPrice: Number(s.defaultPrice) || 0,
          ...gstOf(s),
          priceMissing: !(Number(s.defaultPrice) > 0),
        })),
        ...customItems.map((item) => ({
          id: item.id,
          sourceType: "CUSTOM",
          description: item.name,
          quantity: 1,
          unitPrice: item.price,
          taxRate: 0,
        })),
      ];
      await appendToBasket(selectedPatientId, selectedPatient?.clientId, lines);
      return totalAmount;
    },
    onSuccess: (total) => {
      setSentTotal(total);
      queryClient.invalidateQueries({ queryKey: ["open-baskets"] });
    },
    onError: (err: Error) => setErrorMessage(err.message || "Could not send services to billing."),
  });

  if (!isOpen) return null;

  const resetAndClose = () => {
    setSelectedPatientId("");
    setSelectedServiceIds([]);
    setCustomItems([]);
    setSentTotal(null);
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
            <p className="text-xs text-slate-500">Services from your catalog are sent to the patient&apos;s billing basket.</p>
          </div>
        </div>

        {sentTotal !== null ? (
          <div className="my-6 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Sent to billing</h3>
              <p className="text-sm text-slate-600 mt-1">
                Reception will find {selectedPatient?.name || "this patient"} under &quot;Waiting to bill&quot; in Clinic POS.
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Total: <span className="font-semibold text-slate-800">{formatMoney(sentTotal)}</span>
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

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Patient / Pet *</label>
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

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Services from your catalog</label>
              {servicesQuery.isLoading ? (
                <p className="text-xs text-slate-400">Loading services…</p>
              ) : catalog.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  No services in your catalog yet. Add them under Settings → Services, or add a custom item below.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {catalog.map((item) => {
                    const selected = selectedServiceIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleService(item.id)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-sm cursor-pointer transition ${
                          selected
                            ? "border-teal-600 bg-teal-50/50 text-teal-950 font-medium"
                            : "border-slate-200 bg-slate-50/50 text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              selected ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white"
                            }`}
                          >
                            {selected && <Check className="h-3 w-3 stroke-[3]" />}
                          </div>
                          <span>{item.name}</span>
                        </div>
                        <span className="font-semibold text-slate-900">{formatMoney(item.defaultPrice)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {customItems.length > 0 && (
              <div className="space-y-1.5">
                {customItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
                    <span className="font-medium text-slate-800">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{formatMoney(item.price)}</span>
                      <button
                        type="button"
                        onClick={() => setCustomItems((prev) => prev.filter((x) => x.id !== item.id))}
                        className="text-slate-400 hover:text-rose-600"
                        aria-label={`Remove ${item.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
                placeholder="Price ₹"
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

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-xl font-extrabold text-slate-900">{formatMoney(totalAmount)}</p>
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
                  disabled={sendMutation.isPending || itemCount === 0 || !selectedPatientId}
                  onClick={() => sendMutation.mutate()}
                  className="rounded-lg bg-teal-700 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 shadow-sm"
                >
                  {sendMutation.isPending ? "Sending…" : "Send to Billing →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
