"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getDashboardOverview, type DashboardOverview } from "@/lib/api";

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery<DashboardOverview>({
    queryKey: ["dashboard-overview"],
    queryFn: getDashboardOverview,
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-slate-500 animate-pulse">Loading command center metrics…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load dashboard metrics. Check API connection.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric Cards Banner */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Today's Visits</p>
          <p className="mt-2 text-3xl font-extrabold text-teal-800">{data.todayAppointmentsCount}</p>
          <Link href="/clinic" className="mt-2 inline-block text-xs font-semibold text-teal-600 hover:underline">
            View Schedule →
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Live Queue</p>
          <p className="mt-2 text-3xl font-extrabold text-amber-600">{data.activeQueueCount}</p>
          <Link href="/clinic" className="mt-2 inline-block text-xs font-semibold text-amber-700 hover:underline">
            Manage Queue →
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Today's Revenue</p>
          <p className="mt-2 text-3xl font-extrabold text-emerald-700">
            ${Number(data.todayRevenue).toFixed(2)}
          </p>
          <Link href="/analytics" className="mt-2 inline-block text-xs font-semibold text-emerald-700 hover:underline">
            Financial Ledger →
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Patients</p>
          <p className="mt-2 text-3xl font-extrabold text-indigo-700">{data.activePatientsCount}</p>
          <Link href="/patients" className="mt-2 inline-block text-xs font-semibold text-indigo-700 hover:underline">
            Directory →
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Low Stock</p>
          <p className="mt-2 text-3xl font-extrabold text-rose-600">{data.lowStockCount}</p>
          <Link href="/inventory" className="mt-2 inline-block text-xs font-semibold text-rose-700 hover:underline">
            Stock Batches →
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Hospitalized (IPD)</p>
          <p className="mt-2 text-3xl font-extrabold text-purple-700">{data.hospitalizedCount}</p>
          <Link href="/specialties" className="mt-2 inline-block text-xs font-semibold text-purple-700 hover:underline">
            Admissions →
          </Link>
        </div>
      </div>

      {/* Due Vaccinations and Dewormings Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Vaccinations Due */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Vaccinations Due (Next 14 Days)</h2>
              <p className="text-xs text-slate-500">Automated reminder triggers</p>
            </div>
            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">
              {data.vaccinationsDue.length} Due
            </span>
          </div>

          <div className="mt-3 divide-y divide-slate-100">
            {data.vaccinationsDue.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No vaccination doses due in the next 14 days.</p>
            ) : (
              data.vaccinationsDue.map((v) => (
                <div key={v.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <Link href={`/patients?selected=${v.patientId}`} className="text-sm font-semibold text-teal-900 hover:underline">
                      {v.patientName}
                    </Link>
                    <p className="text-xs text-slate-500">{v.itemName}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                      Due: {v.nextDueOn}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Deworming Due */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Deworming Due (Next 14 Days)</h2>
              <p className="text-xs text-slate-500">Parasite prevention schedule</p>
            </div>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
              {data.dewormingsDue.length} Due
            </span>
          </div>

          <div className="mt-3 divide-y divide-slate-100">
            {data.dewormingsDue.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">No deworming treatments due in the next 14 days.</p>
            ) : (
              data.dewormingsDue.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <Link href={`/patients?selected=${d.patientId}`} className="text-sm font-semibold text-teal-900 hover:underline">
                      {d.patientName}
                    </Link>
                    <p className="text-xs text-slate-500">{d.itemName}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Due: {d.nextDueOn}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Action Station */}
      <div className="rounded-xl border border-teal-100 bg-gradient-to-r from-teal-50 to-emerald-50 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-teal-900">Operational Shortcuts</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href="/clinic"
            className="rounded-lg bg-teal-800 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-teal-900"
          >
            + New Appointment / Queue Check-in
          </Link>
          <Link
            href="/patients"
            className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-teal-900 border border-teal-200 shadow-sm hover:bg-teal-50"
          >
            + Register Pet / Owner
          </Link>
          <Link
            href="/pharmacy"
            className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-teal-900 border border-teal-200 shadow-sm hover:bg-teal-50"
          >
            Dispense Medicines
          </Link>
          <Link
            href="/inventory"
            className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-teal-900 border border-teal-200 shadow-sm hover:bg-teal-50"
          >
            Adjust Stock
          </Link>
          <Link
            href="/specialties"
            className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-teal-900 border border-teal-200 shadow-sm hover:bg-teal-50"
          >
            Labs & Surgeries
          </Link>
          <Link
            href="/analytics"
            className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-teal-900 border border-teal-200 shadow-sm hover:bg-teal-50"
          >
            Record Clinic Expense
          </Link>
        </div>
      </div>
    </div>
  );
}
