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
  currentUser,
  type Vendor,
  type PurchaseOrder,
  type PurchaseOrderDetail,
  type Product,
  type SessionUser,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function ProcurementPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"ORDERS" | "VENDORS">("ORDERS");
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showPoModal, setShowPoModal] = useState(false);
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);
  const [showReceiveModal, setShowReceiveModal] = useState<string | null>(null);

  // New Vendor / Distributor Form
  const [distributorName, setDistributorName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorAddress, setVendorAddress] = useState("");
  const [vendorGstin, setVendorGstin] = useState("");
  const [vendorDlNumber, setVendorDlNumber] = useState("");
  const [vendorNotes, setVendorNotes] = useState("");

  // New PO Form
  const [poVendorId, setPoVendorId] = useState("");
  const [poLines, setPoLines] = useState<{ productId: string; quantity: number; unitCost: number }[]>([
    { productId: "", quantity: 10, unitCost: 5.0 },
  ]);

  // Receive Form
  const [receiveBranchId, setReceiveBranchId] = useState("");
  const [receiveExpiry, setReceiveExpiry] = useState("");

  // Session & Roles
  const session = useQuery<SessionUser>({
    queryKey: ["session"],
    queryFn: currentUser,
  });
  const isOwner = session.data?.roles.includes("OWNER") ?? false;

  // Queries
  const vendorsQuery = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: listVendors,
    enabled: isOwner,
  });

  const ordersQuery = useQuery<PurchaseOrder[]>({
    queryKey: ["purchase-orders"],
    queryFn: listPurchaseOrders,
    enabled: isOwner,
  });

  const productsQuery = useQuery<Product[]>({
    queryKey: ["procurement-products"],
    queryFn: () => listProducts(),
    enabled: isOwner,
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
        distributorName: distributorName.trim(),
        companyName: companyName.trim() || undefined,
        contactPerson: contactPerson.trim() || undefined,
        phone: vendorPhone.trim() || undefined,
        email: vendorEmail.trim() || undefined,
        address: vendorAddress.trim() || undefined,
        gstin: vendorGstin.trim() || undefined,
        dlNumber: vendorDlNumber.trim() || undefined,
        notes: vendorNotes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      setShowVendorModal(false);
      setDistributorName("");
      setCompanyName("");
      setContactPerson("");
      setVendorPhone("");
      setVendorEmail("");
      setVendorAddress("");
      setVendorGstin("");
      setVendorDlNumber("");
      setVendorNotes("");
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
                  <th className="p-3">Distributor / Supplier</th>
                  <th className="p-3">Company / Brand</th>
                  <th className="p-3">Person Who Sold (Rep)</th>
                  <th className="p-3">Phone & Mails</th>
                  <th className="p-3">Location & Credentials</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendorsQuery.isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-400">Loading distributors…</td>
                  </tr>
                ) : (vendorsQuery.data || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      No distributors / vendors listed. Click "+ Add Vendor" to register one.
                    </td>
                  </tr>
                ) : (
                  (vendorsQuery.data || []).map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">
                        <div>{v.distributorName || v.name}</div>
                        {v.notes && <p className="text-[10px] text-slate-400 font-normal italic mt-0.5 line-clamp-1">{v.notes}</p>}
                      </td>
                      <td className="p-3">
                        {v.companyName ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
                            <span>🏭</span>
                            <span>{v.companyName}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">General / Multiple Brands</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-700">
                        {v.contactPerson ? (
                          <div className="flex items-center gap-1 font-semibold text-teal-950">
                            <span>👤</span>
                            <span>{v.contactPerson}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="p-3 space-y-0.5">
                        {v.phone && (
                          <div className="text-slate-700 font-medium flex items-center gap-1">
                            <span>📞</span>
                            <span>{v.phone}</span>
                          </div>
                        )}
                        {v.email && (
                          <div className="text-teal-700 text-[11px] flex items-center gap-1">
                            <span>✉️</span>
                            <a href={`mailto:${v.email}`} className="hover:underline">{v.email}</a>
                          </div>
                        )}
                        {!v.phone && !v.email && <span className="text-slate-400 italic">—</span>}
                      </td>
                      <td className="p-3 space-y-1">
                        {v.address && <p className="text-slate-600 text-[11px] line-clamp-1">📍 {v.address}</p>}
                        <div className="flex flex-wrap gap-1">
                          {v.gstin && (
                            <span className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.2 text-[10px] font-mono text-slate-600">
                              GST: {v.gstin}
                            </span>
                          )}
                          {v.dlNumber && (
                            <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 text-[10px] font-mono text-emerald-800">
                              DL: {v.dlNumber}
                            </span>
                          )}
                        </div>
                        {!v.address && !v.gstin && !v.dlNumber && <span className="text-slate-400 italic">—</span>}
                      </td>
                      <td className="p-3">
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          {v.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 border-teal-600 text-teal-700 hover:bg-teal-50"
                          onClick={() => {
                            setPoVendorId(v.id);
                            setShowPoModal(true);
                          }}
                        >
                          + Create PO
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: New Vendor / Distributor */}
      {showVendorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Add Pharmaceutical Distributor & Supplier</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Record complete distributor details including the sales representative who sold to us, ordering emails, address, and license information.
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>Distributor / Supplier Name *</span>
                    <span className="text-[11px] text-teal-700 font-normal">Who invoices & delivers</span>
                  </label>
                  <input
                    type="text"
                    value={distributorName}
                    onChange={(e) => setDistributorName(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm focus:border-teal-600 focus:outline-none"
                    placeholder="e.g. Sri Sai Veterinary Distributors, Medivet, Henry Schein"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>Pharmaceutical Company / Manufacturer</span>
                    <span className="text-[11px] text-indigo-700 font-normal">Brand or maker</span>
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm focus:border-teal-600 focus:outline-none"
                    placeholder="e.g. Zoetis Animal Health, Virbac, Intas, MSD Animal Health"
                  />
                </div>
              </div>

              {/* The Person Who Sold to Us & Contact Details */}
              <div className="rounded-lg bg-teal-50/50 border border-teal-100 p-3.5 space-y-3">
                <p className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                  <span>👤</span>
                  <span>Sales Representative & Communication Channels</span>
                </p>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Person Who Sold To Us / Representative Name</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm bg-white focus:border-teal-600 focus:outline-none"
                    placeholder="e.g. Ramesh Kumar (Sales Rep / Area Manager)"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Phone / Mobile</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={vendorPhone}
                      onChange={(e) => setVendorPhone(e.target.value.replace(/[^0-9+]/g, "").slice(0, 15))}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-sm bg-white focus:border-teal-600 focus:outline-none"
                      placeholder="e.g. 9876543210"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Email Address (Mails)</label>
                    <input
                      type="email"
                      value={vendorEmail}
                      onChange={(e) => setVendorEmail(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-sm bg-white focus:border-teal-600 focus:outline-none"
                      placeholder="orders@distributor.com"
                    />
                  </div>
                </div>
              </div>

              {/* Address & Legal / Tax Information */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Physical Address / City / Depot</label>
                  <input
                    type="text"
                    value={vendorAddress}
                    onChange={(e) => setVendorAddress(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm focus:border-teal-600 focus:outline-none"
                    placeholder="e.g. Shop 14, Wholesale Medical Complex, Banjara Hills, Hyderabad"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">GSTIN (Tax ID)</label>
                    <input
                      type="text"
                      value={vendorGstin}
                      onChange={(e) => setVendorGstin(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-sm uppercase focus:border-teal-600 focus:outline-none"
                      placeholder="e.g. 36AABCP1234F1Z5"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Drug License No. (DL)</label>
                    <input
                      type="text"
                      value={vendorDlNumber}
                      onChange={(e) => setVendorDlNumber(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-sm focus:border-teal-600 focus:outline-none"
                      placeholder="e.g. 20B/21B-TS/HYD/12345"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Payment Terms & Notes</label>
                  <textarea
                    rows={2}
                    value={vendorNotes}
                    onChange={(e) => setVendorNotes(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm focus:border-teal-600 focus:outline-none"
                    placeholder="e.g. Net 30 days credit, orders on Mondays, bank transfer details"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setShowVendorModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white hover:bg-teal-900"
                disabled={!distributorName.trim() || createVendorMutation.isPending}
                onClick={() => createVendorMutation.mutate()}
              >
                {createVendorMutation.isPending ? "Saving…" : "Save Distributor & Supplier"}
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
                <label className="text-xs font-semibold text-slate-700">Distributor / Vendor *</label>
                <select
                  value={poVendorId}
                  onChange={(e) => setPoVendorId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                >
                  <option value="">Select distributor / vendor…</option>
                  {(vendorsQuery.data || []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.distributorName || v.name} {v.companyName ? `— [${v.companyName}]` : ""}
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
