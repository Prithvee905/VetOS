"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPublicBooking, getPublicBookingClinic, getPublicBookingSlots, type BookingConfirmation } from "@/lib/api";

/** yyyy-mm-dd for a date in the clinic's time zone. */
function isoDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const clinic = useQuery({ queryKey: ["public-booking", slug], queryFn: () => getPublicBookingClinic(slug), retry: false });
  const tz = clinic.data?.timezone ?? "Asia/Kolkata";

  // The days the clinic takes bookings, from today up to its booking window.
  const days = useMemo(() => {
    if (!clinic.data) return [];
    const out: { iso: string; label: string }[] = [];
    for (let i = 0; i <= clinic.data.maxDaysAhead && out.length < 14; i++) {
      const d = new Date(Date.now() + i * 86_400_000);
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
      const iso = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday) + 1;
      if (clinic.data.days.includes(iso)) {
        out.push({
          iso: isoDate(d, tz),
          label: new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(d),
        });
      }
    }
    return out;
  }, [clinic.data, tz]);

  const [day, setDay] = useState<string | null>(null);
  const selectedDay = day ?? days[0]?.iso ?? null;
  const slots = useQuery({
    queryKey: ["public-booking-slots", slug, selectedDay],
    queryFn: () => getPublicBookingSlots(slug, selectedDay!),
    enabled: Boolean(selectedDay && clinic.data),
  });

  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ ownerName: "", phone: "", petName: "", speciesCode: "CANINE", reason: "", whatsappConsent: true, website: "" });
  const [done, setDone] = useState<BookingConfirmation | null>(null);

  const book = useMutation({
    mutationFn: () => createPublicBooking(slug, { ...form, startsAt: slot! }),
    onSuccess: (confirmation) => setDone(confirmation),
    onError: () => slots.refetch(),
  });

  const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const phoneOk = form.phone.replace(/\D/g, "").length >= 10;
  const canSubmit = slot && form.ownerName.trim() && form.petName.trim() && phoneOk && !book.isPending;

  if (clinic.isLoading) {
    return <main className="mx-auto max-w-lg px-4 py-10 text-slate-600">Loading…</main>;
  }
  if (clinic.isError || !clinic.data) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <p className="text-slate-700">Online booking is not available for this link. Please call the clinic to book.</p>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">You&apos;re booked</h1>
        <p className="text-slate-700">
          {done.petName}&apos;s appointment at {done.clinicName} is on <strong>{done.label}</strong>.
        </p>
        {form.whatsappConsent && <p className="text-sm text-slate-500">We&apos;ve sent the details to your WhatsApp.</p>}
        {clinic.data.phone && <p className="text-sm text-slate-500">Need to change it? Call {clinic.data.phone}.</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
      <header className="flex items-start gap-3">
        <PawPrint className="mt-1 text-teal-700" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{clinic.data.name}</h1>
          {clinic.data.address && <p className="text-sm text-slate-600">{clinic.data.address}</p>}
          <p className="text-sm text-slate-500">Book an appointment</p>
        </div>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">1. Pick a day</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => (
            <button
              key={d.iso}
              type="button"
              onClick={() => { setDay(d.iso); setSlot(null); }}
              className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${selectedDay === d.iso ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-800"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">2. Pick a time</h2>
        {slots.isLoading ? (
          <p className="text-sm text-slate-500">Loading times…</p>
        ) : (slots.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No free times on this day. Try another day.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(slots.data ?? []).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlot(s)}
                className={`rounded-lg border px-2 py-2 text-sm ${slot === s ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-800"}`}
              >
                {timeLabel(s)}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">3. Your details</h2>
        <label className="text-sm" htmlFor="b-name">Your name</label>
        <input id="b-name" className="rounded-md border border-slate-300 px-3 py-2" autoComplete="name"
          value={form.ownerName} onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))} />
        <label className="text-sm" htmlFor="b-phone">Mobile number</label>
        <input id="b-phone" type="tel" inputMode="tel" className="rounded-md border border-slate-300 px-3 py-2" autoComplete="tel"
          value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/[^0-9+ ]/g, "").slice(0, 16) }))} />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm" htmlFor="b-pet">Pet&apos;s name</label>
            <input id="b-pet" className="rounded-md border border-slate-300 px-3 py-2"
              value={form.petName} onChange={(e) => setForm((f) => ({ ...f, petName: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm" htmlFor="b-species">Pet</label>
            <select id="b-species" className="rounded-md border border-slate-300 px-3 py-2"
              value={form.speciesCode} onChange={(e) => setForm((f) => ({ ...f, speciesCode: e.target.value }))}>
              <option value="CANINE">Dog</option>
              <option value="FELINE">Cat</option>
              <option value="AVIAN">Bird</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>
        <label className="text-sm" htmlFor="b-reason">Reason for visit (optional)</label>
        <input id="b-reason" className="rounded-md border border-slate-300 px-3 py-2" maxLength={300}
          value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        {/* Left empty by people; bots fill it in. */}
        <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden"
          value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.whatsappConsent} onChange={(e) => setForm((f) => ({ ...f, whatsappConsent: e.target.checked }))} />
          Send me the confirmation and reminders on WhatsApp
        </label>
      </section>

      {book.isError && <p className="text-sm text-rose-700">{book.error instanceof Error ? book.error.message : "Could not book."}</p>}
      <Button type="button" disabled={!canSubmit} onClick={() => book.mutate()}>
        {book.isPending ? "Booking…" : slot ? `Book ${timeLabel(slot)}` : "Pick a time"}
      </Button>
    </main>
  );
}
