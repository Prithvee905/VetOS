"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getOnlineBookingSettings, updateOnlineBookingSettings, type OnlineBookingSettings } from "@/lib/api";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function suggestSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export default function OnlineBookingSettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["online-booking"], queryFn: getOnlineBookingSettings });
  const [draft, setDraft] = useState<Partial<OnlineBookingSettings>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (values: OnlineBookingSettings) =>
      updateOnlineBookingSettings({
        enabled: values.enabled,
        slug: values.slug ?? undefined,
        openTime: values.openTime.slice(0, 5),
        closeTime: values.closeTime.slice(0, 5),
        slotMinutes: values.slotMinutes,
        days: values.days,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["online-booking"], data);
      setDraft({});
      setError(null);
      setMessage("Online booking settings saved.");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save."),
  });

  if (settings.isLoading || !settings.data) {
    return <p className="text-slate-600">Loading…</p>;
  }
  const v: OnlineBookingSettings = { ...settings.data, ...draft };
  const slug = v.slug ?? "";
  const link = typeof window !== "undefined" && slug ? `${window.location.origin}/book/${slug}` : "";

  return (
    <div className="flex max-w-2xl flex-col gap-6 pb-20">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Online booking</h2>
        <p className="text-sm text-slate-500">
          Clients book from your booking page or by sending &quot;book&quot; to your WhatsApp number. Bookings go to a free doctor
          and appear in Appointments marked &quot;Booked online&quot;.
        </p>
      </div>
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={v.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} />
          Take online bookings
        </label>

        <div>
          <label className="text-xs font-semibold text-slate-600" htmlFor="ob-slug">Booking link</label>
          <div className="mt-1 flex items-center gap-1 text-sm">
            <span className="text-slate-500">/book/</span>
            <input
              id="ob-slug"
              className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 font-mono"
              placeholder={suggestSlug(v.clinicName)}
              value={slug}
              onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 49) }))}
            />
            {!slug && (
              <Button type="button" size="sm" variant="outline" onClick={() => setDraft((d) => ({ ...d, slug: suggestSlug(v.clinicName) }))}>
                Use suggestion
              </Button>
            )}
          </div>
          {link && settings.data.enabled && settings.data.slug === slug && (
            <p className="mt-1 text-xs text-slate-600">
              Share this link on your website, Google listing and Instagram:{" "}
              <a className="font-semibold text-teal-700 underline" href={link} target="_blank" rel="noreferrer">{link}</a>
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="ob-open">Opens</label>
            <input id="ob-open" type="time" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              value={v.openTime.slice(0, 5)} onChange={(e) => setDraft((d) => ({ ...d, openTime: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="ob-close">Closes</label>
            <input id="ob-close" type="time" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              value={v.closeTime.slice(0, 5)} onChange={(e) => setDraft((d) => ({ ...d, closeTime: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="ob-slot">Slot length</label>
            <select id="ob-slot" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5"
              value={v.slotMinutes} onChange={(e) => setDraft((d) => ({ ...d, slotMinutes: Number(e.target.value) }))}>
              {[15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-slate-600">Days</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {WEEKDAYS.map((label, i) => {
              const iso = i + 1;
              const on = v.days.includes(iso);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, days: on ? v.days.filter((x) => x !== iso) : [...v.days, iso].sort() }))}
                  className={`rounded-md border px-3 py-1 text-sm ${on ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 text-slate-700"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <Button type="button" className="self-start" disabled={save.isPending} onClick={() => save.mutate(v)}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
