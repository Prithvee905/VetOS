"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getVaccineSchedule, skipVaccineScheduleEntry } from "@/lib/api";

function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(isoDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/** The pet's upcoming doses from the clinic's vaccine protocols. */
export function VaccineSchedulePanel({ patientId, canEdit }: { patientId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const schedule = useQuery({
    queryKey: ["vaccine-schedule", patientId],
    queryFn: () => getVaccineSchedule(patientId),
  });
  const skip = useMutation({
    mutationFn: (entryId: string) => skipVaccineScheduleEntry(entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vaccine-schedule", patientId] }),
  });

  const due = (schedule.data ?? []).filter((e) => e.status === "DUE");
  if (schedule.isLoading || due.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">Vaccine schedule</h4>
      <p className="mt-0.5 text-xs text-slate-500">From your clinic&apos;s vaccine protocols. Reminders go out on WhatsApp a week before.</p>
      <ul className="mt-3 divide-y divide-slate-100">
        {due.map((entry) => {
          const days = daysUntil(entry.dueOn);
          const tone = days < 0 ? "text-rose-700" : days <= 30 ? "text-amber-700" : "text-slate-600";
          return (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <span className="font-semibold text-slate-900">{entry.vaccineName}</span>
                <span className="ml-2 text-xs text-slate-500">{entry.doseLabel}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-semibold ${tone}`}>
                  {new Date(entry.dueOn).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  {days < 0 ? ` · overdue ${Math.abs(days)}d` : days === 0 ? " · today" : ` · in ${days}d`}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    className="text-xs text-slate-500 underline hover:text-slate-800"
                    title="Not needed here (e.g. given at another clinic)"
                    disabled={skip.isPending}
                    onClick={() => skip.mutate(entry.id)}
                  >
                    Skip
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
