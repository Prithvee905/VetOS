"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listVendors,
  createVendor,
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  receiveGoods,
  listProducts,
  listBranches,
  type Vendor,
  type PurchaseOrder,
  type PurchaseOrderDetail,
  type Product,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function ProcurementPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"ORDERS" | "VENDORS">("ORDERS");
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showPoModal, setShowPoModal] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [showReceiveModal, setShowReceiveModal] = useState<string | null>(null);

  // New Vendor Form
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");

  // New PO Form
  const [poVendorId, setPoVendorId] = useState("");
  const [poLines, setPoLines] = useState<{ productId: string; quantity: number; unitCost: number }[]>([
    { productId: "", quantity: 10, unitCost: 5.0 },
  ]);

  // Receive Form
  const [receiveBranchId, setReceiveBranchId] = useState("");
  const [receiveExpiry, setReceiveExpiry] = useState("");

  // Queries
  const vendorsQuery = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: listVendors,
  });

  const ordersQuery = useQuery<PurchaseOrder[]>({
    queryKey: ["purchase-orders"],
    queryFn: listPurchaseOrders,
  });

  const productsQuery = useQuery<Product[]>({
    queryKey: ["procurement-products"],
    queryFn: () => listProducts(),
  });

  const branchesQuery = useQuery({
    queryKey: ["branches"],
    queryFn: () => listBranches(),
  });

  const selectedPoQuery = useQuery<PurchaseOrderDetail>({
    queryKey: ["purchase-order-detail", selectedPoId],
    queryFn: () => getPurchaseOrder(selectedPoId!),
    enabled: !!selectedPoId,
  });

  // Mutations
  const createVendorMutation = useMutation({
    mutationFn: () =>
      createVendor({
        name: vendorName,
        phone: vendorPhone || undefined,
        email: vendorEmail || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      setShowVendorModal(false);
      setVendorName("");
      setVendorPhone("");
      setVendorEmail("");
    },
  });

  const createPoMutation = useMutation({
    mutationFn: () =>
      createPurchaseOrder({
        vendorId: poVendorId,
        lines: poLines.filter((l) => l.productId && l.quantity > 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setShowPoModal(false);
      setPoVendorId("");
      setPoLines([{ productId: "", quantity: 10, unitCost: 5.0 }]);
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (poId: string) =>
      receiveGoods(poId, {
        branchId: receiveBranchId || branchesQuery.data?.items?.[0]?.id || "",
        defaultExpiryDate: receiveExpiry || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      if (selectedPoId) {
        queryClient.invalidateQueries({ queryKey: ["purchase-order-detail", selectedPoId] });
      }
      setShowReceiveModal(null);
    },
  });

  const addLine = () => {
    setPoLines([...poLines, { productId: "", quantity: 10, unitCost: 5.0 }]);
  };

  const updateLine = (index: number, field: "productId" | "quantity" | "unitCost", value: any) => {
    const updated = [...poLines];
    updated[index] = { ...updated[index], [field]: value };
    setPoLines(updated);
  };

  const removeLine = (index: number) => {
    if (poLines.length <= 1) return;
    setPoLines(poLines.filter((_, i) => i !== index));
  };

  const defaultBranchId = branchesQuery.data?.items?.[0]?.id || "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Procurement & Supplier Relations</h2>
          <p className="text-xs text-slate-500">Manage pharmaceutical vendors, purchase orders, and goods receipt</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowVendorModal(true)}
          >
            + Add Vendor
          </Button>
          <Button
            type="button"
            className="bg-teal-800 text-white hover:bg-teal-900"
            size="sm"
            onClick={() => setShowPoModal(true)}
          >
            + Create Purchase Order
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("ORDERS")}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeTab === "ORDERS"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Purchase Orders ({ordersQuery.data?.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("VENDORS")}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeTab === "VENDORS"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          Vendors / Suppliers ({vendorsQuery.data?.length ?? 0})
        </button>
      </div>

      {activeTab === "ORDERS" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* PO List */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900">Purchase Orders</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600">
                  <tr>
                    <th className="p-3">Vendor</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ordersQuery.isLoading ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">Loading purchase orders…</td>
                    </tr>
                  ) : (ordersQuery.data || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        No purchase orders found. Click "+ Create Purchase Order" to begin.
                      </td>
                    </tr>
                  ) : (
                    (ordersQuery.data || []).map((po) => (
                      <tr
                        key={po.id}
                        className={`hover:bg-slate-50 cursor-pointer ${
                          selectedPoId === po.id ? "bg-teal-50" : ""
                        }`}
                        onClick={() => setSelectedPoId(po.id)}
                      >
                        <td className="p-3 font-bold text-slate-900">{po.vendorName}</td>
                        <td className="p-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                              po.status === "RECEIVED"
                                ? "bg-emerald-100 text-emerald-800"
                                : po.status === "CANCELLED"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {po.status}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-teal-900">${Number(po.totalAmount).toFixed(2)}</td>
                        <td className="p-3 text-slate-500">{new Date(po.orderedAt).toLocaleDateString()}</td>
                        <td className="p-3">
                          {po.status === "ORDERED" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReceiveBranchId(defaultBranchId);
                                setShowReceiveModal(po.id);
                              }}
                              className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              Receive Stock
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* PO Detail View */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            {!selectedPoId ? (
              <p className="p-8 text-center text-xs text-slate-400">
                Select a purchase order to view itemized lines and receipt history.
              </p>
            ) : selectedPoQuery.isLoading ? (
              <p className="p-8 text-center text-xs text-slate-400 animate-pulse">Loading order details…</p>
            ) : !selectedPoQuery.data ? (
              <p className="text-xs text-rose-600">Failed to load order detail.</p>
            ) : (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <h4 className="text-sm font-bold text-slate-900">
                    Order Details: {selectedPoQuery.data.header.vendorName}
                  </h4>
                  <p className="text-xs text-slate-500">
                    Status: <span className="font-semibold text-slate-800">{selectedPoQuery.data.header.status}</span>
                  </p>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  {selectedPoQuery.data.lines.map((l) => (
                    <div key={l.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900">{l.productName}</p>
                        <p className="text-slate-500 font-mono text-[11px]">
                          {l.quantity} units @ ${Number(l.unitCost).toFixed(2)}
                        </p>
                      </div>
                      <p className="font-bold text-slate-900">${Number(l.lineTotal).toFixed(2)}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-100 pt-3 flex justify-between font-bold text-sm">
                  <span>Total Cost:</span>
                  <span className="text-teal-900">
                    ${Number(selectedPoQuery.data.header.totalAmount).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Vendors Tab */
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600">
                <tr>
                  <th className="p-3">Vendor / Company</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendorsQuery.isLoading ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400">Loading vendors…</td>
                  </tr>
                ) : (vendorsQuery.data || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-400">
                      No vendors listed. Click "+ Add Vendor" to create one.
                    </td>
                  </tr>
                ) : (
                  (vendorsQuery.data || []).map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{v.name}</td>
                      <td className="p-3 text-slate-600">{v.phone || "N/A"}</td>
                      <td className="p-3 text-slate-600">{v.email || "N/A"}</td>
                      <td className="p-3">
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          {v.status}
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

      {/* Modal: New Vendor */}
      {showVendorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Add Pharmaceutical Vendor</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Company / Vendor Name *</label>
                <input
                  type="text"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Zoetis Animal Health"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Phone</label>
                <input
                  type="text"
                  value={vendorPhone}
                  onChange={(e) => setVendorPhone(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="+1 800-555-0199"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Email</label>
                <input
                  type="email"
                  value={vendorEmail}
                  onChange={(e) => setVendorEmail(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="orders@vendor.com"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowVendorModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white"
                disabled={!vendorName || createVendorMutation.isPending}
                onClick={() => createVendorMutation.mutate()}
              >
                {createVendorMutation.isPending ? "Saving…" : "Save Vendor"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Purchase Order */}
      {showPoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Create Purchase Order</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">Vendor *</label>
                <select
                  value={poVendorId}
                  onChange={(e) => setPoVendorId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                >
                  <option value="">Select vendor…</option>
                  {(vendorsQuery.data || []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700">Products & Quantities *</label>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs font-bold text-teal-700 hover:underline"
                  >
                    + Add Product Line
                  </button>
                </div>

                <div className="space-y-3">
                  {poLines.map((line, idx) => (
                    <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2 rounded border border-slate-200">
                      <select
                        value={line.productId}
                        onChange={(e) => updateLine(idx, "productId", e.target.value)}
                        className="flex-1 rounded border border-slate-300 p-1.5 text-xs bg-white"
                      >
                        <option value="">Select item…</option>
                        {(productsQuery.data || []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, "quantity", parseFloat(e.target.value) || 1)}
                        className="w-20 rounded border border-slate-300 p-1.5 text-xs bg-white"
                        placeholder="Qty"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.unitCost}
                        onChange={(e) => updateLine(idx, "unitCost", parseFloat(e.target.value) || 0)}
                        className="w-24 rounded border border-slate-300 p-1.5 text-xs bg-white"
                        placeholder="Unit Cost"
                      />
                      {poLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="text-rose-600 font-bold text-sm px-1"
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setShowPoModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white"
                disabled={!poVendorId || poLines.every((l) => !l.productId) || createPoMutation.isPending}
                onClick={() => createPoMutation.mutate()}
              >
                {createPoMutation.isPending ? "Placing Order…" : "Place Purchase Order"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Receive Stock */}
      {showReceiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Receive Stock & Update Inventory</h3>
            <p className="text-xs text-slate-500">
              This will automatically mark the purchase order as RECEIVED and increment live stock batches.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Receiving Branch *</label>
                <select
                  value={receiveBranchId || defaultBranchId}
                  onChange={(e) => setReceiveBranchId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                >
                  {(branchesQuery.data?.items || []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Batch Expiry Date</label>
                <input
                  type="date"
                  value={receiveExpiry}
                  onChange={(e) => setReceiveExpiry(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowReceiveModal(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={receiveMutation.isPending}
                onClick={() => receiveMutation.mutate(showReceiveModal)}
              >
                {receiveMutation.isPending ? "Updating Stock…" : "Confirm Receipt"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
