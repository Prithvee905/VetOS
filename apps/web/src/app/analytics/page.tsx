"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getFinancialSummary,
  listExpenses,
  createExpense,
  type FinancialSummary,
  type Expense,
} from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function AnalyticsPage() {
  const queryClient = useQueryClient();

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState("Medical Supplies");
  const [expenseAmount, setExpenseAmount] = useState("50.00");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenseNotes, setExpenseNotes] = useState("");

  const summaryQuery = useQuery<FinancialSummary>({
    queryKey: ["financial-summary"],
    queryFn: getFinancialSummary,
  });

  const expensesQuery = useQuery<Expense[]>({
    queryKey: ["clinic-expenses"],
    queryFn: () => listExpenses(),
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
      setExpenseAmount("50.00");
      setExpenseNotes("");
    },
  });

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
          <p className="mt-2 text-2xl font-extrabold text-slate-900">
            ${Number(summary?.totalInvoiced ?? 0).toFixed(2)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Collected Cash</p>
          <p className="mt-2 text-2xl font-extrabold text-emerald-700">
            ${Number(summary?.totalCollected ?? 0).toFixed(2)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Outstanding AR</p>
          <p className="mt-2 text-2xl font-extrabold text-amber-600">
            ${Number(summary?.totalOutstanding ?? 0).toFixed(2)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Expenses</p>
          <p className="mt-2 text-2xl font-extrabold text-rose-600">
            ${Number(summary?.totalExpenses ?? 0).toFixed(2)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Net Margin</p>
          <p className={`mt-2 text-2xl font-extrabold ${Number(summary?.netProfit ?? 0) >= 0 ? "text-teal-800" : "text-rose-700"}`}>
            ${Number(summary?.netProfit ?? 0).toFixed(2)}
          </p>
        </div>
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
                    <span className="text-slate-900 font-mono">${Number(c.amount).toFixed(2)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-teal-600 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          (Number(c.amount) / Math.max(1, Number(summary?.totalInvoiced ?? 1))) * 100
                        )}%`,
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
                    <span className="text-slate-900 font-mono">${Number(e.amount).toFixed(2)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          (Number(e.amount) / Math.max(1, Number(summary?.totalExpenses ?? 1))) * 100
                        )}%`,
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
                    <td className="p-3 font-bold text-rose-700">${Number(exp.amount).toFixed(2)}</td>
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
                <label className="text-xs font-semibold text-slate-700">Amount ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
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
    </div>
  );
}
