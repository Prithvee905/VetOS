"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  listBatches,
  listAllMovements,
  listProducts,
  listBranches,
  listPrescriptions,
  createBatch,
  adjustStock,
  dispensePrescription,
  currentUser,
  type InventoryBatch,
  type StockMovement,
  type Product,
  type PrescriptionSummary,
  type SessionUser,
} from "@/lib/api";
import {
  Package,
  AlertTriangle,
  Clock,
  TrendingDown,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Pill,
  BarChart3,
  ArrowDownCircle,
  ArrowUpCircle,
  Minus,
} from "lucide-react";

type Tab = "batches" | "lowstock" | "expiring" | "dispense" | "movements";

function daysUntilExpiry(expiresOn: string | null): number | null {
  if (!expiresOn) return null;
  const diff = new Date(expiresOn).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ expiresOn }: { expiresOn: string | null }) {
  if (!expiresOn) return <span className="text-slate-400 text-[11px]">No expiry</span>;
  const days = daysUntilExpiry(expiresOn);
  if (days === null) return null;
  if (days < 0) return <span className="rounded-full bg-rose-100 border border-rose-300 px-2 py-0.5 text-[10px] font-bold text-rose-700">EXPIRED</span>;
  if (days <= 30) return <span className="rounded-full bg-amber-50 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-700">Exp {expiresOn} ({days}d)</span>;
  return <span className="text-[11px] text-slate-500">{expiresOn}</span>;
}

function StockBadge({ qty }: { qty: number }) {
  if (qty === 0) return <span className="rounded-full bg-rose-100 border border-rose-300 px-2 py-0.5 text-[10px] font-bold text-rose-700">OUT OF STOCK</span>;
  if (qty <= 5) return <span className="rounded-full bg-amber-50 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-700">LOW {qty}</span>;
  return <span className="text-sm font-bold text-slate-800">{qty}</span>;
}

export default function PharmacyPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("batches");
  const [search, setSearch] = useState("");
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Add batch modal
  const [showAddBatch, setShowAddBatch] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [addBranchId, setAddBranchId] = useState("");
  const [addQty, setAddQty] = useState("10");
  const [addExpiry, setAddExpiry] = useState("");
  const [addCost, setAddCost] = useState("");

  // Adjust stock modal
  const [adjustBatchId, setAdjustBatchId] = useState<string | null>(null);
  const [adjustBatchName, setAdjustBatchName] = useState("");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("Manual correction");
  const [adjustDir, setAdjustDir] = useState<"add" | "remove">("add");

  function ok(m: string) { setMsg(m); setErr(null); setTimeout(() => setMsg(null), 5000); }
  function fail(e: unknown) { setErr(e instanceof Error ? e.message : "Error"); setTimeout(() => setErr(null), 7000); }

  const session = useQuery<SessionUser>({ queryKey: ["session"], queryFn: currentUser });
  const canWrite = session.data?.roles.some(r => ["OWNER", "STAFF", "RECEPTIONIST"].includes(r)) ?? false;

  const batchesQ = useQuery<InventoryBatch[]>({ queryKey: ["pharmacy-batches"], queryFn: () => listBatches() });
  const lowStockQ = useQuery<InventoryBatch[]>({ queryKey: ["pharmacy-low"], queryFn: () => listBatches({ lowStockOnly: true }) });
  const expiringQ = useQuery<InventoryBatch[]>({ queryKey: ["pharmacy-expiring"], queryFn: () => listBatches({ expiringOnly: true }) });
  const movementsQ = useQuery<StockMovement[]>({ queryKey: ["pharmacy-movements"], queryFn: () => listAllMovements(100) });
  const productsQ = useQuery<Product[]>({ queryKey: ["products"], queryFn: () => listProducts() });
  const branchesQ = useQuery({ queryKey: ["branches"], queryFn: listBranches });
  const rxQ = useQuery<PrescriptionSummary[]>({ queryKey: ["prescriptions-pending"], queryFn: () => listPrescriptions("PENDING") });

  const batches = batchesQ.data ?? [];
  const filtered = useMemo(() => {
    if (!search.trim()) return batches;
    const q = search.toLowerCase();
    return batches.filter(b => b.productName?.toLowerCase().includes(q) || b.sku?.toLowerCase().includes(q));
  }, [batches, search]);

  const totalSkus = useMemo(() => new Set(batches.map(b => b.productId)).size, [batches]);
  const lowCount = (lowStockQ.data ?? []).length;
  const expiringCount = (expiringQ.data ?? []).length;
  const totalUnits = useMemo(() => batches.reduce((s, b) => s + (b.quantityOnHand ?? 0), 0), [batches]);

  const addBatchMutation = useMutation({
    mutationFn: () => createBatch({
      productId: addProductId,
      branchId: addBranchId,
      initialQuantity: Number(addQty),
      expiresOn: addExpiry || undefined,
      costPrice: addCost ? Number(addCost) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pharmacy-batches"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-low"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-expiring"] });
      setShowAddBatch(false);
      setAddProductId(""); setAddBranchId(""); setAddQty("10"); setAddExpiry(""); setAddCost("");
      ok("Batch added to inventory.");
    },
    onError: fail,
  });

  const adjustMutation = useMutation({
    mutationFn: () => adjustStock({
      batchId: adjustBatchId!,
      quantityChange: adjustDir === "add" ? Math.abs(Number(adjustQty)) : -Math.abs(Number(adjustQty)),
      reason: adjustReason,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["pharmacy-batches"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-low"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-movements"] });
      setAdjustBatchId(null); setAdjustQty(""); setAdjustReason("Manual correction");
      ok(`Stock updated. New qty: ${res.updatedQuantityOnHand}`);
    },
    onError: fail,
  });

  const dispenseMutation = useMutation({
    mutationFn: (rxId: string) => dispensePrescription({ prescriptionId: rxId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prescriptions-pending"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-batches"] });
      qc.invalidateQueries({ queryKey: ["pharmacy-movements"] });
      ok("Prescription dispensed — stock deducted automatically.");
    },
    onError: fail,
  });

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "batches", label: "All Stock", count: batches.length },
    { key: "lowstock", label: "Low Stock", count: lowCount },
    { key: "expiring", label: "Expiring Soon", count: expiringCount },
    { key: "dispense", label: "Dispense Rx", count: rxQ.data?.length },
    { key: "movements", label: "Movements", count: movementsQ.data?.length },
  ];

  const displayBatches =
    tab === "lowstock" ? (lowStockQ.data ?? []) :
    tab === "expiring" ? (expiringQ.data ?? []) :
    filtered;

  return (
    <div className="space-y-5">
      {/* Alerts */}
      {msg && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)} className="font-bold text-emerald-600">✕</button>
        </div>
      )}
      {err && (
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <span>{err}</span>
          <button onClick={() => setErr(null)} className="font-bold text-rose-600">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pharmacy & Inventory</h2>
          <p className="text-xs text-slate-500">Medicine stock, batch tracking, dispensing, and adjustments</p>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowAddBatch(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition"
          >
            <Plus className="h-3.5 w-3.5" /> Add Stock Batch
          </button>
        )}
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-2 text-slate-500"><BarChart3 className="h-4 w-4 text-teal-600" /><span className="text-xs font-medium">Total SKUs</span></div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{totalSkus}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-2 text-slate-500"><Package className="h-4 w-4 text-teal-600" /><span className="text-xs font-medium">Total Units</span></div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{totalUnits}</p>
        </div>
        <div className={`rounded-2xl border p-4 shadow-xs ${lowCount > 0 ? "border-rose-200 bg-rose-50" : "border-slate-200/80 bg-white"}`}>
          <div className="flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${lowCount > 0 ? "text-rose-600" : "text-slate-400"}`} /><span className="text-xs font-medium text-slate-500">Low Stock</span></div>
          <p className={`mt-2 text-2xl font-extrabold ${lowCount > 0 ? "text-rose-700" : "text-slate-900"}`}>{lowCount}</p>
        </div>
        <div className={`rounded-2xl border p-4 shadow-xs ${expiringCount > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200/80 bg-white"}`}>
          <div className="flex items-center gap-2"><Clock className={`h-4 w-4 ${expiringCount > 0 ? "text-amber-600" : "text-slate-400"}`} /><span className="text-xs font-medium text-slate-500">Expiring ≤30d</span></div>
          <p className={`mt-2 text-2xl font-extrabold ${expiringCount > 0 ? "text-amber-700" : "text-slate-900"}`}>{expiringCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.key ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === t.key ? "bg-teal-900 text-teal-100" : "bg-slate-300 text-slate-700"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Batches / Low Stock / Expiring */}
      {(tab === "batches" || tab === "lowstock" || tab === "expiring") && (
        <div className="space-y-3">
          {tab === "batches" && (
            <div className="flex items-center gap-2">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by medicine name or SKU…"
                className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-1.5 text-xs shadow-xs focus:border-teal-500 focus:outline-none"
              />
              <button onClick={() => qc.invalidateQueries({ queryKey: ["pharmacy-batches"] })} className="text-slate-400 hover:text-teal-700 transition">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          )}

          {displayBatches.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center text-xs text-slate-400">
              {tab === "lowstock" ? "No low-stock batches. All medicines are adequately stocked." :
               tab === "expiring" ? "No batches expiring in the next 30 days." :
               "No stock batches found. Add your first batch using the button above."}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="p-3 font-semibold text-slate-600">Medicine</th>
                    <th className="p-3 font-semibold text-slate-600 hidden sm:table-cell">SKU</th>
                    <th className="p-3 font-semibold text-slate-600">Qty</th>
                    <th className="p-3 font-semibold text-slate-600 hidden md:table-cell">Expiry</th>
                    <th className="p-3 font-semibold text-slate-600 hidden lg:table-cell">Vendor</th>
                    <th className="p-3 font-semibold text-slate-600 hidden lg:table-cell">Cost / Sale</th>
                    {canWrite && <th className="p-3 font-semibold text-slate-600">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayBatches.map(b => (
                    <>
                      <tr key={b.id} className="hover:bg-slate-50/50 transition">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setExpandedBatch(expandedBatch === b.id ? null : b.id)}
                              className="text-slate-400 hover:text-teal-700"
                            >
                              {expandedBatch === b.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                            <span className="font-semibold text-slate-900">{b.productName}</span>
                          </div>
                          {b.companyName && <p className="ml-5 text-[11px] text-slate-400">{b.companyName}</p>}
                        </td>
                        <td className="p-3 font-mono text-slate-500 hidden sm:table-cell">{b.sku}</td>
                        <td className="p-3"><StockBadge qty={b.quantityOnHand} /></td>
                        <td className="p-3 hidden md:table-cell"><ExpiryBadge expiresOn={b.expiresOn ?? null} /></td>
                        <td className="p-3 text-slate-500 hidden lg:table-cell">{b.vendorName ?? "—"}</td>
                        <td className="p-3 text-slate-600 hidden lg:table-cell">
                          {b.costPrice ? `₹${b.costPrice}` : "—"} / {b.salePrice ? `₹${b.salePrice}` : "—"}
                        </td>
                        {canWrite && (
                          <td className="p-3">
                            <button
                              onClick={() => { setAdjustBatchId(b.id); setAdjustBatchName(b.productName); setAdjustQty(""); setAdjustDir("add"); }}
                              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-teal-50 hover:border-teal-400 hover:text-teal-800 transition"
                            >
                              Adjust
                            </button>
                          </td>
                        )}
                      </tr>
                      {expandedBatch === b.id && (
                        <tr key={`${b.id}-detail`}>
                          <td colSpan={canWrite ? 7 : 6} className="bg-slate-50/70 px-6 py-3">
                            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                              <div><span className="text-slate-500">Batch ID</span><p className="font-mono font-semibold text-slate-700 truncate">{b.id.slice(0, 8)}…</p></div>
                              <div><span className="text-slate-500">Branch</span><p className="font-semibold text-slate-700">{b.branchId?.slice(0, 8) ?? "—"}</p></div>
                              <div><span className="text-slate-500">Cost Price</span><p className="font-semibold text-slate-700">{b.costPrice ? `₹${b.costPrice}` : "Not set"}</p></div>
                              <div><span className="text-slate-500">Sale Price</span><p className="font-semibold text-slate-700">{b.salePrice ? `₹${b.salePrice}` : "Not set"}</p></div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Dispense Rx */}
      {tab === "dispense" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Pending prescriptions ready to be dispensed from stock. Dispensing deducts inventory automatically.</p>
          {rxQ.isLoading ? (
            <div className="flex h-32 items-center justify-center text-xs text-slate-400">Loading pending prescriptions…</div>
          ) : (rxQ.data ?? []).length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center text-xs text-slate-400">
              No pending prescriptions to dispense. All prescriptions are dispensed.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs divide-y divide-slate-100">
              {(rxQ.data ?? []).map(rx => (
                <div key={rx.id} className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Pill className="h-3.5 w-3.5 text-teal-600" />
                      <span className="font-semibold text-slate-900 text-xs">{rx.patientName}</span>
                      <span className="text-slate-400 text-[11px]">• {rx.clientName}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 ml-5">{rx.medicines}</p>
                    <p className="text-[11px] text-slate-400 ml-5">Dr. {rx.doctorName} • {new Date(rx.createdAt).toLocaleDateString()}</p>
                  </div>
                  {canWrite && (
                    <button
                      disabled={dispenseMutation.isPending}
                      onClick={() => dispenseMutation.mutate(rx.id)}
                      className="rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-teal-800 transition disabled:opacity-50"
                    >
                      {dispenseMutation.isPending ? "Dispensing…" : "Dispense →"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Movements */}
      {tab === "movements" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Last 100 stock movements across all medicines and batches.</p>
            <button onClick={() => qc.invalidateQueries({ queryKey: ["pharmacy-movements"] })} className="text-slate-400 hover:text-teal-700">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          {movementsQ.isLoading ? (
            <div className="flex h-32 items-center justify-center text-xs text-slate-400">Loading movements…</div>
          ) : (movementsQ.data ?? []).length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center text-xs text-slate-400">No stock movements recorded yet.</div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className="p-3 font-semibold text-slate-600">Type</th>
                    <th className="p-3 font-semibold text-slate-600">Medicine</th>
                    <th className="p-3 font-semibold text-slate-600">Qty</th>
                    <th className="p-3 font-semibold text-slate-600 hidden sm:table-cell">Reference</th>
                    <th className="p-3 font-semibold text-slate-600 hidden md:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(movementsQ.data ?? []).map(m => {
                    const isIn = m.movementType === "RESTOCK" || m.movementType === "ADJUSTMENT_IN" || Number(m.quantity) > 0;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50 transition">
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            {isIn
                              ? <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-600" />
                              : <ArrowDownCircle className="h-3.5 w-3.5 text-rose-500" />}
                            <span className={`font-semibold ${isIn ? "text-emerald-700" : "text-rose-600"}`}>
                              {m.movementType?.replace(/_/g, " ")}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 font-medium text-slate-800">{m.productName ?? "—"}</td>
                        <td className="p-3">
                          <span className={`font-bold ${Number(m.quantity) > 0 ? "text-emerald-700" : "text-rose-600"}`}>
                            {Number(m.quantity) > 0 ? "+" : ""}{m.quantity}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500 hidden sm:table-cell truncate max-w-[180px]">{m.reference ?? "—"}</td>
                        <td className="p-3 text-slate-400 hidden md:table-cell">{new Date(m.createdAt).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Add Stock Batch */}
      {showAddBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Add Stock Batch</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Medicine *</label>
                <select value={addProductId} onChange={e => setAddProductId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs">
                  <option value="">Select medicine…</option>
                  {(productsQ.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Branch *</label>
                <select value={addBranchId} onChange={e => setAddBranchId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs">
                  <option value="">Select branch…</option>
                  {(branchesQ.data?.items ?? []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Quantity *</label>
                  <input type="number" min="1" value={addQty} onChange={e => setAddQty(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Cost Price (₹)</label>
                  <input type="number" min="0" step="0.01" value={addCost} onChange={e => setAddCost(e.target.value)} placeholder="0.00" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Expiry Date</label>
                <input type="date" value={addExpiry} onChange={e => setAddExpiry(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowAddBatch(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button
                disabled={!addProductId || !addBranchId || !addQty || addBatchMutation.isPending}
                onClick={() => addBatchMutation.mutate()}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {addBatchMutation.isPending ? "Adding…" : "Add Batch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Adjust Stock */}
      {adjustBatchId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Adjust Stock</h3>
            <p className="text-xs text-slate-500 -mt-2">{adjustBatchName}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Direction</label>
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => setAdjustDir("add")}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${adjustDir === "add" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                  >
                    <Plus className="h-3 w-3" /> Add stock
                  </button>
                  <button
                    onClick={() => setAdjustDir("remove")}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${adjustDir === "remove" ? "border-rose-400 bg-rose-50 text-rose-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                  >
                    <Minus className="h-3 w-3" /> Remove
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Quantity *</label>
                <input type="number" min="1" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs" placeholder="Enter units" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Reason *</label>
                <select value={adjustReason} onChange={e => setAdjustReason(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs">
                  <option value="Manual correction">Manual correction</option>
                  <option value="Breakage / damage">Breakage / damage</option>
                  <option value="Expired stock removed">Expired stock removed</option>
                  <option value="Restock from purchase">Restock from purchase</option>
                  <option value="Stock count audit">Stock count audit</option>
                  <option value="Complimentary / sample">Complimentary / sample</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setAdjustBatchId(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button
                disabled={!adjustQty || adjustMutation.isPending}
                onClick={() => adjustMutation.mutate()}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 transition ${adjustDir === "add" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-rose-700 hover:bg-rose-800"}`}
              >
                {adjustMutation.isPending ? "Saving…" : adjustDir === "add" ? "Add Stock" : "Remove Stock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
