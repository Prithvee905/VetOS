"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Zap,
  Users,
  PawPrint,
  Calendar,
  DollarSign,
  SlidersHorizontal,
  Package,
  MessageSquare,
  TrendingUp,
  Receipt,
  ArrowRight,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Stethoscope,
} from "lucide-react";
import {
  getDashboardOverview,
  currentUser,
  getClinicProfile,
  listBranches,
  type DashboardOverview,
  type SessionUser,
  type ClinicProfile,
  type Branch,
} from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { QuickServiceModal } from "@/components/quick-service-modal";
import { RecordSoapModal } from "@/components/record-soap-modal";

export default function DashboardPage() {
  const [quickServiceOpen, setQuickServiceOpen] = useState(false);
  const [soapModalOpen, setSoapModalOpen] = useState(false);
  const [selectedSoapPatientId, setSelectedSoapPatientId] = useState<string>("");
  const [remindersExpanded, setRemindersExpanded] = useState(false);
  const [queueScope, setQueueScope] = useState<"MY" | "ALL">("MY");
  const [apptScope, setApptScope] = useState<"MY" | "ALL">("MY");

  const { data, isLoading, error } = useQuery<DashboardOverview>({
    queryKey: ["dashboard-overview"],
    queryFn: getDashboardOverview,
    refetchInterval: 10_000,
  });

  const session = useQuery<SessionUser>({
    queryKey: ["session"],
    queryFn: currentUser,
  });
  const isDoctorOrOwner = session.data?.roles.some((r) => ["OWNER", "DOCTOR"].includes(r)) ?? false;

  const clinic = useQuery<ClinicProfile>({
    queryKey: ["clinic-profile"],
    queryFn: getClinicProfile,
  });

  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => listBranches(),
  });

  if (isLoading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          <p className="text-xs font-medium text-slate-500">Loading clinic command center…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 shadow-sm">
        <div className="flex items-center gap-2 font-bold">
          <AlertCircle className="h-5 w-5 text-rose-600" />
          Failed to load dashboard metrics.
        </div>
        <p className="mt-1 text-xs text-rose-600">
          Ensure the API server is reachable and database migrations are up to date.
        </p>
      </div>
    );
  }

  // Clinic Header Metadata
  const clinicName = (clinic.data?.name || "").toUpperCase();
  const mainBranch = branches.data?.items?.[0]?.name ? `${branches.data.items[0].name.toUpperCase()} BRANCH` : "";
  const clinicHeader = [clinicName, mainBranch].filter(Boolean).join(" • ");
  const userGreeting = session.data?.displayName || "Clinic Owner";
  const userRoles = session.data?.roles || [];
  const isOwner = userRoles.includes("OWNER");
  const isDoctor = userRoles.includes("DOCTOR") && !isOwner;
  const isReceptionist = userRoles.includes("RECEPTIONIST") && !isOwner;
  const isStaff = userRoles.includes("STAFF") && !isOwner;

  function matchesDoctor(docName?: string | null): boolean {
    if (!docName || !userGreeting) return false;
    const cleanDoc = docName.toLowerCase().replace(/dr\.?\s*/g, "").trim();
    const cleanUser = userGreeting.toLowerCase().replace(/dr\.?\s*/g, "").trim();
    return cleanDoc.includes(cleanUser) || cleanUser.includes(cleanDoc);
  }

  const allQueue = data.liveQueue || [];
  const myQueue = allQueue.filter((item) => matchesDoctor(item.doctorName));
  const displayedQueue = (isDoctor && queueScope === "MY") ? myQueue : allQueue;

  const allAppts = data.todayAppointments || [];
  const myAppts = allAppts.filter((item) => matchesDoctor(item.doctorName));
  const displayedAppts = (isDoctor && apptScope === "MY") ? myAppts : allAppts;

  const myWaitingCount = myQueue.filter((q) => q.status === "WAITING").length;
  const myConsultingCount = myQueue.filter((q) => q.status === "IN_CONSULTATION").length;

  return (
    <div className="space-y-5">
      {/* 1. HERO HEADER BANNER */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#072F35] via-[#0A3D44] to-[#0E4B54] px-6 py-5 text-white shadow-md sm:px-8 sm:py-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-[11px] font-bold tracking-wider text-teal-200/90 uppercase">
              {clinicHeader}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Welcome back, {userGreeting}
            </h1>
            <p className="mt-1 text-xs text-teal-100/80">
              Here is your veterinary clinic operating overview for today.
            </p>
          </div>
        </div>
      </div>

      {/* 2. ACTION BAR */}
      <div className="flex flex-wrap items-center gap-2.5 py-0.5">
        <button
          onClick={() => setQuickServiceOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-[#0D7A75] px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0B6864] hover:shadow active:scale-95"
        >
          <Zap className="h-3.5 w-3.5 fill-white text-white" />
          <span>Quick Service (Walk-in, no consultation)</span>
        </button>

        {isDoctorOrOwner && (
          <button
            onClick={() => {
              setSelectedSoapPatientId("");
              setSoapModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-teal-600 bg-teal-50/50 px-4 py-1.5 text-xs font-semibold text-teal-800 shadow-2xs transition hover:bg-teal-100 hover:shadow active:scale-95"
          >
            <Stethoscope className="h-3.5 w-3.5 text-teal-700" />
            <span>Record SOAP Consultation</span>
          </button>
        )}

        <span className="text-xs text-slate-500">
          Walk-in procedures & SOAP clinical consultations with auto-billing.
        </span>
      </div>

      {/* 3. TOP 4 PRIMARY KPI CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: If doctor, show "My Patients Waiting", else "Pet Owners" */}
        {isDoctor ? (
          <Link
            href="/clinic"
            className="group flex items-center justify-between rounded-2xl border border-teal-200/90 bg-teal-50/40 p-5 shadow-xs transition hover:border-teal-400 hover:shadow-sm"
          >
            <div>
              <p className="text-xs font-semibold text-teal-800">My Patients Waiting</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-teal-950">
                {myWaitingCount}
              </p>
              <p className="mt-1 text-xs text-teal-700">
                {myConsultingCount > 0 ? `${myConsultingCount} in consult now` : "Assigned waiting for you"}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-100 text-teal-800 transition group-hover:bg-teal-200">
              <Users className="h-5 w-5" />
            </div>
          </Link>
        ) : (
          <Link
            href="/patients"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-teal-300 hover:shadow-sm"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Pet Owners</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {data.petOwnersCount || data.activePatientsCount || 0}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 transition group-hover:bg-teal-100">
              <Users className="h-5 w-5" />
            </div>
          </Link>
        )}

        {/* Card 2: Registered Pets */}
        <Link
          href="/patients"
          className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-emerald-300 hover:shadow-sm"
        >
          <div>
            <p className="text-xs font-medium text-slate-500">Registered Pets</p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
              {data.registeredPetsCount || data.activePatientsCount || 0}
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 transition group-hover:bg-emerald-100">
            <PawPrint className="h-5 w-5" />
          </div>
        </Link>

        {/* Card 3: Appointments */}
        <Link
          href="/clinic"
          className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-amber-300 hover:shadow-sm"
        >
          <div>
            <p className="text-xs font-medium text-slate-500">{isDoctor ? "My Today's Appointments" : "Appointments"}</p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
              {isDoctor ? myAppts.length : data.todayAppointmentsCount}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {isDoctor
                ? `${myAppts.filter(a => a.status === 'SCHEDULED').length} scheduled / ${myAppts.filter(a => a.status !== 'SCHEDULED').length} checked-in`
                : `${data.scheduledAppointmentsCount} scheduled / ${data.checkedInAppointmentsCount} checked-in`}
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 transition group-hover:bg-amber-100">
            <Calendar className="h-5 w-5" />
          </div>
        </Link>

        {/* Card 4: Role-Tailored KPI (Financial strictly for OWNER; Clinical IPD for DOCTOR; Front-desk for RECEPTIONIST/STAFF) */}
        {isOwner ? (
          <Link
            href="/analytics"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-purple-300 hover:shadow-sm"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Revenue (Invoiced)</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {formatMoney(data.todayRevenue, clinic.data?.currencyCode)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {Number(data.outstandingDues) > 0
                  ? `${formatMoney(data.outstandingDues, clinic.data?.currencyCode)} outstanding dues`
                  : "No outstanding dues"}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 transition group-hover:bg-purple-100">
              <DollarSign className="h-5 w-5" />
            </div>
          </Link>
        ) : isDoctor ? (
          <Link
            href="/specialties"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-blue-300 hover:shadow-sm"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Inpatients (IPD)</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {data.hospitalizedCount || 0}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Active clinical admissions in hospital
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
              <Stethoscope className="h-5 w-5" />
            </div>
          </Link>
        ) : isReceptionist ? (
          <Link
            href="/clinic"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-teal-300 hover:shadow-sm"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Checked-In Visits</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {data.checkedInAppointmentsCount || 0}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {data.activeQueueCount || 0} currently waiting in lobby
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 transition group-hover:bg-teal-100">
              <Clock className="h-5 w-5" />
            </div>
          </Link>
        ) : (
          <Link
            href="/clinic"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-indigo-300 hover:shadow-sm"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Active Queue</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {data.activeQueueCount || 0}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Patients in active care & triage
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-100">
              <Clock className="h-5 w-5" />
            </div>
          </Link>
        )}
      </div>

      {/* 4. MIDDLE SECTION: LIVE QUEUE (LEFT) + APPOINTMENTS & INVENTORY (RIGHT) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* LEFT COLUMN: LIVE QUEUE TRIAGE BOARD (7 cols) */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-7 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <div className="flex items-center gap-2 text-slate-900">
                <SlidersHorizontal className="h-4 w-4 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">Live Queue Triage Board</h2>
              </div>
              <div className="flex items-center gap-2">
                {isDoctor && (
                  <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setQueueScope("MY")}
                      className={`rounded px-2.5 py-1 text-xs font-bold transition-all ${
                        queueScope === "MY"
                          ? "bg-white text-teal-800 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      👤 My Patients ({myQueue.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setQueueScope("ALL")}
                      className={`rounded px-2.5 py-1 text-xs font-bold transition-all ${
                        queueScope === "ALL"
                          ? "bg-white text-teal-800 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      🏥 All Clinic ({allQueue.length})
                    </button>
                  </div>
                )}
                <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                  {displayedQueue.length} In Board
                </span>
              </div>
            </div>

            {/* Doctor scope banner */}
            {isDoctor && queueScope === "MY" && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-teal-50/70 border border-teal-200/70 px-3 py-1.5 text-xs text-teal-900">
                <span className="flex items-center gap-1.5 font-medium">
                  <span>🩺</span>
                  <span>Filtered to patients assigned to <strong>{userGreeting}</strong></span>
                </span>
                {allQueue.length > myQueue.length && (
                  <button
                    type="button"
                    onClick={() => setQueueScope("ALL")}
                    className="font-bold underline text-teal-800 hover:text-teal-950 text-[11px]"
                  >
                    View other {allQueue.length - myQueue.length} clinic patients →
                  </button>
                )}
              </div>
            )}

            {/* Queue Cards */}
            <div className="mt-4 space-y-3">
              {displayedQueue.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-xs text-slate-400">
                    {isDoctor && queueScope === "MY"
                      ? `No waiting patients currently assigned to ${userGreeting}.`
                      : "No patients currently in the live queue board."}
                  </p>
                  {isDoctor && queueScope === "MY" && allQueue.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setQueueScope("ALL")}
                      className="mt-3 inline-block rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      View All Clinic Patients ({allQueue.length})
                    </button>
                  ) : (
                    <Link
                      href="/clinic"
                      className="mt-3 inline-block rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      + Check-in Patient to Queue
                    </Link>
                  )}
                </div>
              ) : (
                displayedQueue.map((item) => {
                  const isEmergency = item.priority === "EMERGENCY";
                  return (
                    <div
                      key={item.id}
                      className={`relative rounded-xl border p-4 transition ${
                        isEmergency
                          ? "border-rose-200 bg-[#FFF2F4] text-rose-950 shadow-xs"
                          : "border-slate-200/90 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-[#0D7A75] text-[10px] font-extrabold text-white">
                            #{item.tokenNumber}
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            {item.patientName}
                          </span>
                        </div>

                        {/* Priority Badge */}
                        {isEmergency ? (
                          <span className="rounded-full border border-rose-300 bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                            🚨 Emergency
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                            Normal
                          </span>
                        )}
                      </div>

                      <p className="mt-1.5 text-xs text-slate-500">
                        {item.clientName} • Dr: {item.doctorName}
                      </p>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100/70 pt-2.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-teal-50 px-2 py-0.5 font-medium text-teal-800">
                            {item.status.replace("_", " ")}
                          </span>
                          {isDoctorOrOwner && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSoapPatientId(item.patientId);
                                setSoapModalOpen(true);
                              }}
                              className="rounded-md border border-teal-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 transition"
                            >
                              Consult →
                            </button>
                          )}
                        </div>
                        <span className="flex items-center gap-1 text-slate-400">
                          <Clock className="h-3 w-3" />
                          In: {item.checkInTime}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-3">
            <Link
              href="/clinic"
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline"
            >
              Open full triage board <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* RIGHT COLUMN: APPOINTMENTS + INVENTORY (5 cols) */}
        <div className="space-y-5 lg:col-span-5">
          {/* Card 1: Today's Appointments */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <div className="flex items-center gap-2 text-slate-900">
                <Calendar className="h-4 w-4 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">Today's Appointments</h2>
              </div>
              <div className="flex items-center gap-2">
                {isDoctor && (
                  <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setApptScope("MY")}
                      className={`rounded px-2 py-0.5 text-[11px] font-bold transition-all ${
                        apptScope === "MY"
                          ? "bg-white text-teal-800 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Mine ({myAppts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setApptScope("ALL")}
                      className={`rounded px-2 py-0.5 text-[11px] font-bold transition-all ${
                        apptScope === "ALL"
                          ? "bg-white text-teal-800 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      All ({allAppts.length})
                    </button>
                  </div>
                )}
                <Link href="/clinic" className="text-xs font-semibold text-teal-700 hover:underline">
                  View all
                </Link>
              </div>
            </div>

            <div className="mt-3 divide-y divide-slate-100">
              {displayedAppts.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  {isDoctor && apptScope === "MY"
                    ? `No appointments scheduled for ${userGreeting} today.`
                    : "No appointments scheduled for today."}
                </p>
              ) : (
                displayedAppts.map((appt) => (
                  <div key={appt.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        {appt.patientName}{" "}
                        <span className="font-normal text-slate-500">
                          ({appt.appointmentType})
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-400">{appt.doctorName}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-semibold text-slate-800">{appt.time}</p>
                      <span
                        className={`inline-block mt-0.5 rounded-full px-2 py-0.2 text-[10px] font-semibold ${
                          appt.status === "NO_SHOW"
                            ? "border border-amber-300 bg-amber-50 text-amber-700"
                            : appt.status === "WAITING"
                            ? "border border-amber-300 bg-amber-50 text-amber-700"
                            : appt.status === "COMPLETED"
                            ? "border border-teal-300 bg-teal-50 text-teal-700"
                            : "border border-slate-300 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {appt.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card 2: Inventory Stock Status */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900">
                <Package className="h-4 w-4 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">Inventory Stock Status</h2>
              </div>
              <Link href="/inventory" className="text-xs font-semibold text-teal-700 hover:underline">
                Manage stock
              </Link>
            </div>

            <div className="mt-3 divide-y divide-slate-100">
              {(!data.inventoryBatches || data.inventoryBatches.length === 0) ? (
                <p className="py-6 text-center text-xs text-slate-400">All inventory batches are properly stocked.</p>
              ) : (
                data.inventoryBatches.map((batch, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{batch.productName}</p>
                      <p className="text-[11px] text-slate-400">
                        {batch.batchCount} batch(es) • Exp {batch.expiryDate}
                      </p>
                    </div>

                    <div className="text-right">
                      {batch.isLow || batch.quantityOnHand === 0 ? (
                        <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                          {batch.quantityOnHand} left Low
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-emerald-700">
                          {batch.quantityOnHand} left
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 5. BOTTOM ROW: ROLE-TAILORED SECONDARY METRIC CARDS */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Card 1 in bottom row */}
        {isDoctor ? (
          <Link
            href="/patients"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-teal-300 hover:shadow-sm"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Preventive Doses Due</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {(data.vaccinationsDue?.length || 0) + (data.dewormingsDue?.length || 0)}
              </p>
              <p className="mt-1 text-xs text-slate-400">Vaccinations & dewormings</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 transition group-hover:bg-teal-100">
              <Calendar className="h-5 w-5" />
            </div>
          </Link>
        ) : isStaff ? (
          <Link
            href="/inventory"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-amber-300 hover:shadow-sm"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Low Stock Batches</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {data.lowStockCount || 0}
              </p>
              <p className="mt-1 text-xs text-slate-400">Supplies needing restock</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 transition group-hover:bg-amber-100">
              <Package className="h-5 w-5" />
            </div>
          </Link>
        ) : (
          <Link
            href="/communications"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-emerald-300 hover:shadow-sm"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Messages Sent</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {data.messagesSentCount || 0}
              </p>
              <p className="mt-1 text-xs text-slate-400">WhatsApp / Email hub</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 transition group-hover:bg-emerald-100">
              <MessageSquare className="h-5 w-5" />
            </div>
          </Link>
        )}

        {/* Card 2 in bottom row: Queue Today (common to all roles) */}
        <Link
          href="/clinic"
          className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-amber-300 hover:shadow-sm"
        >
          <div>
            <p className="text-xs font-medium text-slate-500">Queue Today</p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
              {data.totalQueueToday || data.activeQueueCount || 0}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {data.emergencyQueueToday || 0} emergency cases
            </p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 transition group-hover:bg-amber-100">
            <TrendingUp className="h-5 w-5" />
          </div>
        </Link>

        {/* Card 3 in bottom row: Role-tailored (Billing Basket for OWNER/RECEPTIONIST, Low Stock for DOCTOR, Inpatients for STAFF) */}
        {isDoctor ? (
          <Link
            href="/inventory"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-amber-300 hover:shadow-sm"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Critical Medication Stock</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {data.lowStockCount || 0}
              </p>
              <p className="mt-1 text-xs text-slate-400">Batches below safety threshold</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 transition group-hover:bg-amber-100">
              <Package className="h-5 w-5" />
            </div>
          </Link>
        ) : isStaff ? (
          <Link
            href="/specialties"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-blue-300 hover:shadow-sm"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Admissions (IPD)</p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                {data.hospitalizedCount || 0}
              </p>
              <p className="mt-1 text-xs text-slate-400">Inpatients under hospital care</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 transition group-hover:bg-blue-100">
              <PawPrint className="h-5 w-5" />
            </div>
          </Link>
        ) : (
          <Link
            href="/clinic"
            className="group flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition hover:border-rose-300 hover:shadow-sm"
          >
            <div>
              <p className="text-xs font-medium text-slate-500">Billable Basket Items</p>
              <p className="mt-1.5 text-xl font-extrabold tracking-tight text-slate-900">
                Invoice Basket
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {data.pendingInvoicesCount > 0
                  ? `${data.pendingInvoicesCount} invoices pending review`
                  : "Click to review billing"}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 transition group-hover:bg-rose-100">
              <Receipt className="h-5 w-5" />
            </div>
          </Link>
        )}
      </div>

      {/* 6. CLINICAL PREVENTIVE REMINDERS (COLLAPSIBLE ACCORDION) */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs">
        <button
          onClick={() => setRemindersExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between p-4 text-left transition hover:bg-slate-50/50"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-slate-700 uppercase tracking-wider">
              Clinical Preventive Schedules (Vaccinations & Dewormings Due in 14 Days)
            </span>
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800">
              {(data.vaccinationsDue?.length || 0) + (data.dewormingsDue?.length || 0)} Total Due
            </span>
          </div>
          {remindersExpanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {remindersExpanded && (
          <div className="border-t border-slate-100 p-5">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Vaccinations Due */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                <h3 className="text-xs font-bold text-slate-800">Vaccinations Due</h3>
                <div className="mt-2 divide-y divide-slate-100">
                  {(!data.vaccinationsDue || data.vaccinationsDue.length === 0) ? (
                    <p className="py-3 text-xs text-slate-400">No vaccination doses due in 14 days.</p>
                  ) : (
                    data.vaccinationsDue.map((v) => (
                      <div key={v.id} className="flex items-center justify-between py-2 text-xs">
                        <div>
                          <Link href={`/patients?selected=${v.patientId}`} className="font-semibold text-teal-900 hover:underline">
                            {v.patientName}
                          </Link>
                          <p className="text-[11px] text-slate-500">{v.itemName}</p>
                        </div>
                        <span className="rounded bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                          Due: {v.nextDueOn}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Dewormings Due */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                <h3 className="text-xs font-bold text-slate-800">Dewormings Due</h3>
                <div className="mt-2 divide-y divide-slate-100">
                  {(!data.dewormingsDue || data.dewormingsDue.length === 0) ? (
                    <p className="py-3 text-xs text-slate-400">No deworming doses due in 14 days.</p>
                  ) : (
                    data.dewormingsDue.map((d) => (
                      <div key={d.id} className="flex items-center justify-between py-2 text-xs">
                        <div>
                          <Link href={`/patients?selected=${d.patientId}`} className="font-semibold text-teal-900 hover:underline">
                            {d.patientName}
                          </Link>
                          <p className="text-[11px] text-slate-500">{d.itemName}</p>
                        </div>
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          Due: {d.nextDueOn}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* QUICK SERVICE MODAL */}
      <QuickServiceModal
        isOpen={quickServiceOpen}
        onClose={() => setQuickServiceOpen(false)}
      />

      {/* RECORD SOAP CONSULTATION MODAL */}
      <RecordSoapModal
        isOpen={soapModalOpen}
        onClose={() => setSoapModalOpen(false)}
        initialPatientId={selectedSoapPatientId}
      />
    </div>
  );
}
