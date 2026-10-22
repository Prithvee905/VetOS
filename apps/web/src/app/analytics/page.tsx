"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  getFinancialSummary,
  getDailyRevenue,
  listExpenses,
  createExpense,
  currentUser,
  issueRefund,
  listRecentPayments,
  type FinancialSummary,
  type DailyRevenuePoint,
  type Expense,
  type SessionUser,
  type PaymentRow,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

function fmt(n: number) {
  return "₹" + Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function TrendChart({ data }: { data: DailyRevenuePoint[] }) {
  const W = 560;
  const H = 120;
  const PAD = { top: 8, right: 8, bottom: 24, left: 44 };

  const maxVal = useMemo(() => Math.max(1, ...data.map(d => Math.max(Number(d.invoiced), Number(d.collected)))), [data]);

  function xOf(i: number) {
    return PAD.left + (i / Math.max(1, data.length - 1)) * (W - PAD.left - PAD.right);
  }
  function yOf(v: number) {
    return PAD.top + (1 - v / maxVal) * (H - PAD.top - PAD.bottom);
  }

  const invoicedPath = data.map((d, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(Number(d.invoiced)).toFixed(1)}`).join(" ");
  const collectedPath = data.map((d, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(Number(d.collected)).toFixed(1)}`).join(" ");

  const yTicks = [0, maxVal * 0.5, maxVal];
  const xTickStep = Math.max(1, Math.floor(data.length / 6));

  if (data.length === 0) {
    return <div className="flex h-[120px] items-center justify-center text-xs text-slate-400">No revenue data for this range.</div>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {/* Y grid */}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={yOf(v)} y2={yOf(v)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={PAD.left - 4} y={yOf(v) + 4} textAnchor="end" fontSize="9" fill="#94a3b8">
            {v === 0 ? "0" : v >= 100000 ? `${(v / 100000).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))}
          </text>
        </g>
      ))}
      {/* X labels */}
      {data.filter((_, i) => i % xTickStep === 0).map((d) => {
        const originalIdx = data.indexOf(d);
        const label = new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        return (
          <text key={d.date} x={xOf(originalIdx)} y={H - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">{label}</text>
        );
      })}
      {/* Invoiced line */}
      {invoicedPath && <path d={invoicedPath} fill="none" stroke="#99f6e4" strokeWidth="2" strokeLinejoin="round" />}
      {/* Collected line */}
      {collectedPath && <path d={collectedPath} fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinejoin="round" />}
      {/* Legend */}
      <g transform={`translate(${W - PAD.right - 120}, ${PAD.top})`}>
        <line x1={0} x2={16} y1={6} y2={6} stroke="#0f766e" strokeWidth="2.5" />
        <text x={20} y={10} fontSize="9" fill="#475569">Collected</text>
        <line x1={70} x2={86} y1={6} y2={6} stroke="#99f6e4" strokeWidth="2" />
        <text x={90} y={10} fontSize="9" fill="#475569">Invoiced</text>
      </g>
    </svg>
  );
}

export default function AnalyticsPage() {
  const queryClient = useQueryClient();

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState("Medical Supplies");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenseNotes, setExpenseNotes] = useState("");
  const [trendDays, setTrendDays] = useState(30);

  const session = useQuery<SessionUser>({ queryKey: ["session"], queryFn: currentUser });
  const isOwner = session.data?.roles.includes("OWNER") ?? false;

  const summaryQuery = useQuery<FinancialSummary>({
    queryKey: ["financial-summary"],
    queryFn: getFinancialSummary,
    enabled: isOwner,
  });

  const trendQuery = useQuery<DailyRevenuePoint[]>({
    queryKey: ["daily-revenue", trendDays],
    queryFn: () => getDailyRevenue(trendDays),
    enabled: isOwner,
  });

  const expensesQuery = useQuery<Expense[]>({
    queryKey: ["clinic-expenses"],
    queryFn: () => listExpenses(),
    enabled: isOwner,
  });

  const paymentsQuery = useQuery<PaymentRow[]>({
    queryKey: ["recent-payments"],
    queryFn: () => listRecentPayments(20),
    enabled: isOwner,
  });

  const [refundReason, setRefundReason] = useState("");
  const refundMutation = useMutation({
    mutationFn: (paymentId: string) =>
      issueRefund(paymentId, { reason: refundReason || "Owner refund" }, `refund-${paymentId}-${Date.now()}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recent-payments"] });
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      setRefundReason("");
    },
  });

  const createExpenseMutation = useMutation({
    mutationFn: () =>
      createExpense({
        category: expenseCategory,
        amount: parseFloat(expenseAmount),
        incurredOn: expenseDate,
        notes: expenseNotes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["clinic-expenses"] });
      setShowExpenseModal(false);
      setExpenseAmount("");
      setExpenseNotes("");
    },
  });

  const trendGrowth = useMemo(() => {
    const pts = trendQuery.data ?? [];
    if (pts.length < 2) return null;
    const half = Math.floor(pts.length / 2);
    const prev = pts.slice(0, half).reduce((s, d) => s + Number(d.collected), 0);
    const curr = pts.slice(half).reduce((s, d) => s + Number(d.collected), 0);
    if (prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }, [trendQuery.data]);

  if (!session.isLoading && !isOwner) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
        <h3 className="font-bold text-base">Restricted Financial Module</h3>
        <p className="mt-1 text-xs text-amber-700">Financial ledgers and revenue analytics are strictly restricted to Clinic Owners.</p>
      </div>
    );
  }

  const summary = summaryQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Financial Ledger & Revenue Insights</h2>
          <p className="text-xs text-slate-500">Executive cashflow, revenue streams, and clinic expenditure</p>
        </div>
        <Button
          type="button"
          className="bg-teal-800 text-white hover:bg-teal-900"
          size="sm"
          onClick={() => setShowExpenseModal(true)}
        >
          + Record Expense
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Invoiced</p>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{fmt(summary?.totalInvoiced ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Collected Cash</p>
          <p className="mt-2 text-2xl font-extrabold text-emerald-700">{fmt(summary?.totalCollected ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Outstanding AR</p>
          <p className="mt-2 text-2xl font-extrabold text-amber-600">{fmt(summary?.totalOutstanding ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Expenses</p>
          <p className="mt-2 text-2xl font-extrabold text-rose-600">{fmt(summary?.totalExpenses ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Net Margin</p>
          <p className={`mt-2 text-2xl font-extrabold ${Number(summary?.netProfit ?? 0) >= 0 ? "text-teal-800" : "text-rose-700"}`}>
            {fmt(summary?.netProfit ?? 0)}
          </p>
        </div>
      </div>

      {/* Revenue Trend Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-slate-900">Daily Revenue Trend</h3>
            {trendGrowth !== null && (
              <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${trendGrowth >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {trendGrowth >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trendGrowth >= 0 ? "+" : ""}{trendGrowth.toFixed(1)}% vs prior half
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {([7, 30, 90] as const).map(d => (
              <button
                key={d}
                onClick={() => setTrendDays(d)}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition ${trendDays === d ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {d}d
              </button>
            ))}
            <button onClick={() => queryClient.invalidateQueries({ queryKey: ["daily-revenue"] })} className="ml-1 text-slate-400 hover:text-teal-700">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {trendQuery.isLoading ? (
          <div className="flex h-[120px] items-center justify-center text-xs text-slate-400">Loading trend data…</div>
        ) : (
          <TrendChart data={trendQuery.data ?? []} />
        )}
      </div>

      {/* Revenue & Expenses Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue by Source */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900">Revenue by Clinical Category</h3>
          <div className="space-y-3">
            {(!summary?.revenueByCategory || summary.revenueByCategory.length === 0) ? (
              <p className="text-xs text-slate-400 py-4 text-center">No categorized revenue recorded yet.</p>
            ) : (
              summary.revenueByCategory.map((c) => (
                <div key={c.category} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-700">{c.category}</span>
                    <span className="text-slate-900 font-mono">{fmt(Number(c.amount))}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-teal-600 rounded-full"
                      style={{
                        width: `${Math.min(100, (Number(c.amount) / Math.max(1, Number(summary?.totalInvoiced ?? 1))) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Expenses by Category */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900">Expenses by Category</h3>
          <div className="space-y-3">
            {(!summary?.expensesByCategory || summary.expensesByCategory.length === 0) ? (
              <p className="text-xs text-slate-400 py-4 text-center">No expenses recorded yet.</p>
            ) : (
              summary.expensesByCategory.map((e) => (
                <div key={e.category} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-700">{e.category}</span>
                    <span className="text-slate-900 font-mono">{fmt(Number(e.amount))}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full"
                      style={{
                        width: `${Math.min(100, (Number(e.amount) / Math.max(1, Number(summary?.totalExpenses ?? 1))) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Expense Ledger Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-slate-900">Recent Operating Expenses</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600">
              <tr>
                <th className="p-3">Category</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Date Incurred</th>
                <th className="p-3">Notes / Voucher Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expensesQuery.isLoading ? (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-slate-400">Loading expense ledger…</td>
                </tr>
              ) : (expensesQuery.data || []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400">No expenses recorded yet.</td>
                </tr>
              ) : (
                (expensesQuery.data || []).map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-900">{exp.category}</td>
                    <td className="p-3 font-bold text-rose-700">{fmt(Number(exp.amount))}</td>
                    <td className="p-3 text-slate-500">{exp.incurredOn}</td>
                    <td className="p-3 text-slate-600">{exp.notes || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Record Expense */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Record Operating Expense</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Category *</label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                >
                  <option value="Medical Supplies">Medical Supplies & Pharmaceuticals</option>
                  <option value="Rent & Facility">Clinic Rent & Utilities</option>
                  <option value="Staff Salaries">Staff Salaries & Honorariums</option>
                  <option value="Diagnostic Equipment">Lab / Diagnostic Equipment</option>
                  <option value="Marketing & Outreach">Marketing & Client Outreach</option>
                  <option value="Administrative">Administrative & Office Supplies</option>
                  <option value="Other">Other Expenses</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Amount (₹) *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Date Incurred *</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Notes / Invoice Ref</label>
                <input
                  type="text"
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Electricity bill September receipt #9821"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowExpenseModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-rose-700 text-white hover:bg-rose-800"
                disabled={!expenseAmount || createExpenseMutation.isPending}
                onClick={() => createExpenseMutation.mutate()}
              >
                {createExpenseMutation.isPending ? "Recording…" : "Save Expense"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {isOwner && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Payment Refunds</h3>
          <p className="text-xs text-slate-500">Issue a full refund against a succeeded payment (owner only).</p>
          <input
            type="text"
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            placeholder="Refund reason (optional)"
            className="w-full max-w-md rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-4">Paid at</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {(paymentsQuery.data ?? []).map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2 pr-4">{p.paidAt ? new Date(p.paidAt).toLocaleString("en-IN") : "—"}</td>
                    <td className="py-2 pr-4">{fmt(Number(p.amount))}</td>
                    <td className="py-2 pr-4">{p.status}</td>
                    <td className="py-2">
                      {p.status === "SUCCEEDED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={refundMutation.isPending}
                          onClick={() => refundMutation.mutate(p.id)}
                        >
                          Refund full
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
