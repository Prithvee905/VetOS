"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listProducts,
  createProduct,
  listBatches,
  createBatch,
  adjustStock,
  listBatchMovements,
  listBranches,
  type Product,
  type InventoryBatch,
  type StockMovement,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function InventoryPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"BATCHES" | "PRODUCTS">("BATCHES");
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [expiringFilter, setExpiringFilter] = useState(false);

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [adjustBatch, setAdjustBatch] = useState<InventoryBatch | null>(null);
  const [viewMovementsBatch, setViewMovementsBatch] = useState<InventoryBatch | null>(null);

  // New Product Form
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("UNIT");
  const [newPrice, setNewPrice] = useState("0.00");

  // New Batch Form
  const [batchProductId, setBatchProductId] = useState("");
  const [batchBranchId, setBatchBranchId] = useState("");
  const [batchInitialQty, setBatchInitialQty] = useState("10");
  const [batchExpiry, setBatchExpiry] = useState("");

  // Adjustment Form
  const [adjustChange, setAdjustChange] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");

  // Queries
  const branchesQuery = useQuery({
    queryKey: ["branches"],
    queryFn: () => listBranches(),
  });

  const productsQuery = useQuery<Product[]>({
    queryKey: ["inventory-products"],
    queryFn: () => listProducts(),
  });

  const batchesQuery = useQuery<InventoryBatch[]>({
    queryKey: ["inventory-batches", lowStockFilter, expiringFilter],
    queryFn: () => listBatches({ lowStockOnly: lowStockFilter, expiringOnly: expiringFilter }),
  });

  const movementsQuery = useQuery<StockMovement[]>({
    queryKey: ["batch-movements", viewMovementsBatch?.id],
    queryFn: () => listBatchMovements(viewMovementsBatch!.id),
    enabled: !!viewMovementsBatch,
  });

  // Mutations
  const createProductMutation = useMutation({
    mutationFn: () =>
      createProduct({
        sku: newSku,
        name: newName,
        unit: newUnit,
        salePrice: parseFloat(newPrice),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-products"] });
      setShowProductModal(false);
      setNewSku("");
      setNewName("");
      setNewPrice("0.00");
    },
  });

  const createBatchMutation = useMutation({
    mutationFn: () =>
      createBatch({
        productId: batchProductId,
        branchId: batchBranchId,
        initialQuantity: parseFloat(batchInitialQty),
        expiresOn: batchExpiry || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      setShowBatchModal(false);
      setBatchProductId("");
      setBatchInitialQty("10");
      setBatchExpiry("");
    },
  });

  const adjustStockMutation = useMutation({
    mutationFn: () =>
      adjustStock({
        batchId: adjustBatch!.id,
        quantityChange: parseFloat(adjustChange),
        reason: adjustReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      setAdjustBatch(null);
      setAdjustChange("0");
      setAdjustReason("");
    },
  });

  const defaultBranchId = branchesQuery.data?.items?.[0]?.id || "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Inventory & Medicines Master</h2>
          <p className="text-xs text-slate-500">Track stock levels, batches, movements, and expiry alerts</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowProductModal(true)}
          >
            + Add Product / Medicine
          </Button>
          <Button
            type="button"
            className="bg-teal-800 text-white hover:bg-teal-900"
            size="sm"
            onClick={() => {
              if (defaultBranchId && !batchBranchId) {
                setBatchBranchId(defaultBranchId);
              }
              setShowBatchModal(true);
            }}
          >
            + New Stock Batch
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("BATCHES")}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeTab === "BATCHES"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Stock Batches ({batchesQuery.data?.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("PRODUCTS")}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeTab === "PRODUCTS"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Catalog / Product Directory ({productsQuery.data?.length ?? 0})
        </button>
      </div>

      {activeTab === "BATCHES" ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={lowStockFilter}
                onChange={(e) => setLowStockFilter(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              Show Low Stock Only (&le; 5 units)
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={expiringFilter}
                onChange={(e) => setExpiringFilter(e.target.checked)}
                className="rounded text-teal-600 focus:ring-teal-500"
              />
              Show Expiring Soon (&le; 30 days)
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600">
                  <tr>
                    <th className="p-3">Product Name</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Quantity On Hand</th>
                    <th className="p-3">Expires On</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batchesQuery.isLoading ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">Loading batches…</td>
                    </tr>
                  ) : (batchesQuery.data || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        No batches found matching filter criteria.
                      </td>
                    </tr>
                  ) : (
                    (batchesQuery.data || []).map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">{b.productName}</td>
                        <td className="p-3 font-mono text-slate-500">{b.sku}</td>
                        <td className="p-3">
                          <span
                            className={`rounded px-2.5 py-0.5 font-bold ${
                              b.quantityOnHand <= 5 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {b.quantityOnHand}
                          </span>
                        </td>
                        <td className="p-3">
                          {b.expiresOn ? (
                            <span className="font-semibold text-slate-700">{b.expiresOn}</span>
                          ) : (
                            <span className="text-slate-400">No Expiry</span>
                          )}
                        </td>
                        <td className="p-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustBatch(b);
                              setAdjustChange("0");
                              setAdjustReason("Stock reconciliation");
                            }}
                            className="rounded bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                          >
                            Adjust Stock
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewMovementsBatch(b)}
                            className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                          >
                            Audit Ledger
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Products Catalog Tab */
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600">
                <tr>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">Unit</th>
                  <th className="p-3">Sale Price</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productsQuery.isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-400">Loading catalog…</td>
                  </tr>
                ) : (productsQuery.data || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">No products configured yet.</td>
                  </tr>
                ) : (
                  (productsQuery.data || []).map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-700">{p.sku}</td>
                      <td className="p-3 font-semibold text-slate-900">{p.name}</td>
                      <td className="p-3 text-slate-600">{p.unit}</td>
                      <td className="p-3 font-bold text-teal-900">${Number(p.salePrice).toFixed(2)}</td>
                      <td className="p-3">
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: New Product */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Add Product to Catalog</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">SKU / Code *</label>
                <input
                  type="text"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value.toUpperCase())}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-mono"
                  placeholder="e.g. AMOX-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Product / Medicine Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Amoxicillin 500mg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Unit</label>
                  <input
                    type="text"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                    placeholder="TABLET / VIAL / ML"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Selling Price *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowProductModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white"
                disabled={!newSku || !newName || createProductMutation.isPending}
                onClick={() => createProductMutation.mutate()}
              >
                {createProductMutation.isPending ? "Saving…" : "Save Product"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Batch */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Add Stock Batch</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Product *</label>
                <select
                  value={batchProductId}
                  onChange={(e) => setBatchProductId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                >
                  <option value="">Select product…</option>
                  {(productsQuery.data || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Branch *</label>
                <select
                  value={batchBranchId || defaultBranchId}
                  onChange={(e) => setBatchBranchId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                >
                  {(branchesQuery.data?.items || []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Initial Quantity *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={batchInitialQty}
                    onChange={(e) => setBatchInitialQty(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Expiry Date</label>
                  <input
                    type="date"
                    value={batchExpiry}
                    onChange={(e) => setBatchExpiry(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowBatchModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white"
                disabled={!batchProductId || createBatchMutation.isPending}
                onClick={() => createBatchMutation.mutate()}
              >
                {createBatchMutation.isPending ? "Adding…" : "Add Batch"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Adjust Stock */}
      {adjustBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Adjust Stock for {adjustBatch.productName}</h3>
            <p className="text-xs text-slate-500">Current on-hand: {adjustBatch.quantityOnHand}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Quantity Change (+ or -) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={adjustChange}
                  onChange={(e) => setAdjustChange(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. 5 to add, -2 to deduct"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Reason / Reference *</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Expired stock write-off or physical count check"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAdjustBatch(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white"
                disabled={!adjustReason || adjustStockMutation.isPending}
                onClick={() => adjustStockMutation.mutate()}
              >
                {adjustStockMutation.isPending ? "Recording…" : "Save Adjustment"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Movements / Audit Ledger */}
      {viewMovementsBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Movement Audit Ledger</h3>
                <p className="text-xs text-slate-500">{viewMovementsBatch.productName} (SKU: {viewMovementsBatch.sku})</p>
              </div>
              <button
                type="button"
                onClick={() => setViewMovementsBatch(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
              {movementsQuery.isLoading ? (
                <p className="p-4 text-center text-slate-400">Loading ledger…</p>
              ) : (movementsQuery.data || []).length === 0 ? (
                <p className="p-4 text-center text-slate-400">No stock movements recorded for this batch.</p>
              ) : (
                (movementsQuery.data || []).map((m) => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 uppercase">{m.movementType}</span>
                      <p className="text-slate-500">{m.reference || "No reference"}</p>
                      <span className="text-[10px] text-slate-400">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <div>
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-xs ${
                          m.quantity > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setViewMovementsBatch(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
