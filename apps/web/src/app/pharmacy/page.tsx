"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listBatches,
  listProducts,
  dispensePrescription,
  type InventoryBatch,
  type Product,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function PharmacyPage() {
  const queryClient = useQueryClient();

  const [prescriptionId, setPrescriptionId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [dispenseQty, setDispenseQty] = useState("1");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [filterQuery, setFilterQuery] = useState("");

  const batchesQuery = useQuery<InventoryBatch[]>({
    queryKey: ["pharmacy-batches"],
    queryFn: () => listBatches(),
  });

  const productsQuery = useQuery<Product[]>({
    queryKey: ["pharmacy-products"],
    queryFn: () => listProducts(),
  });

  const dispenseMutation = useMutation({
    mutationFn: () =>
      dispensePrescription({
        prescriptionId,
        items: [{ batchId: selectedBatchId, quantity: parseFloat(dispenseQty) }],
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["pharmacy-batches"] });
      setSuccessMessage(`Prescription successfully dispensed! Status: ${data.status}`);
      setErrorMessage("");
      setPrescriptionId("");
      setSelectedBatchId("");
      setDispenseQty("1");
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || "Failed to dispense medicine.");
      setSuccessMessage("");
    },
  });

  const filteredBatches = (batchesQuery.data || []).filter((b) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return b.productName.toLowerCase().includes(q) || b.sku.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pharmacy Dispensing & Medicine Counter</h2>
          <p className="text-xs text-slate-500">Atomic inventory deduction on doctor prescription fulfillment</p>
        </div>
      </div>

      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          ✓ {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          ⚠ {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Dispensing Form Station */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Dispense Against Prescription</h3>
            <p className="text-xs text-slate-500">Deducts stock atomically from the selected batch</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Prescription ID (UUID) *</label>
              <input
                type="text"
                value={prescriptionId}
                onChange={(e) => setPrescriptionId(e.target.value.trim())}
                placeholder="Paste Prescription UUID from consultation"
                className="mt-1 w-full rounded border border-slate-300 p-2 text-xs font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Select Medicine Batch *</label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
              >
                <option value="">Select stock batch…</option>
                {(batchesQuery.data || []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.productName} (SKU: {b.sku}) — Available: {b.quantityOnHand} | Exp: {b.expiresOn || "None"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700">Quantity to Dispense *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={dispenseQty}
                onChange={(e) => setDispenseQty(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
              />
            </div>

            <Button
              type="button"
              className="w-full bg-teal-800 text-white hover:bg-teal-900 mt-2"
              disabled={!prescriptionId || !selectedBatchId || !dispenseQty || dispenseMutation.isPending}
              onClick={() => dispenseMutation.mutate()}
            >
              {dispenseMutation.isPending ? "Validating & Deducting Stock…" : "Dispense & Mark Prescribed"}
            </Button>
          </div>
        </div>

        {/* Available Batches Table */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Live Medicine Batches</h3>
              <p className="text-xs text-slate-500">Current on-hand inventory across clinic branches</p>
            </div>
            <input
              type="text"
              placeholder="Search medicine / SKU…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-xs"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase">
                <tr>
                  <th className="p-2.5">Medicine</th>
                  <th className="p-2.5">SKU</th>
                  <th className="p-2.5">Stock On Hand</th>
                  <th className="p-2.5">Expiry Date</th>
                  <th className="p-2.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batchesQuery.isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-400">Loading stock batches…</td>
                  </tr>
                ) : filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      No stock batches available. Add products or receive purchases in Inventory.
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map((b) => {
                    const isLow = b.quantityOnHand <= 5;
                    const isExpiring = b.expiresOn && new Date(b.expiresOn).getTime() < Date.now() + 30 * 86400000;
                    return (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">{b.productName}</td>
                        <td className="p-2.5 text-slate-500 font-mono">{b.sku}</td>
                        <td className="p-2.5">
                          <span
                            className={`rounded px-2 py-0.5 font-bold ${
                              isLow ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {b.quantityOnHand}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] ${
                              isExpiring ? "bg-amber-100 text-amber-800 font-semibold" : "text-slate-600"
                            }`}
                          >
                            {b.expiresOn || "N/A"}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <button
                            type="button"
                            onClick={() => setSelectedBatchId(b.id)}
                            className="rounded bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                          >
                            Select
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
