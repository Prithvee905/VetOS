"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createVaccineProtocol,
  listVaccineProtocols,
  updateVaccineProtocol,
  updateVaccineProtocolStatus,
  type VaccineProtocol,
  type VaccineProtocolInput,
} from "@/lib/api";

const SPECIES = [
  { code: "CANINE", label: "Dogs" },
  { code: "FELINE", label: "Cats" },
  { code: "ANY", label: "All species" },
];

type FormState = {
  speciesCode: string;
  vaccineName: string;
  aliases: string;
  hasPrimary: boolean;
  firstDoseAgeWeeks: string;
  primaryDoses: string;
  primaryIntervalWeeks: string;
  hasBooster: boolean;
  boosterIntervalMonths: string;
};

const EMPTY_FORM: FormState = {
  speciesCode: "CANINE",
  vaccineName: "",
  aliases: "",
  hasPrimary: false,
  firstDoseAgeWeeks: "",
  primaryDoses: "1",
  primaryIntervalWeeks: "4",
  hasBooster: true,
  boosterIntervalMonths: "12",
};

function toForm(p: VaccineProtocol): FormState {
  return {
    speciesCode: p.speciesCode,
    vaccineName: p.vaccineName,
    aliases: p.aliases ?? "",
    hasPrimary: p.firstDoseAgeWeeks !== null,
    firstDoseAgeWeeks: p.firstDoseAgeWeeks === null ? "" : String(p.firstDoseAgeWeeks),
    primaryDoses: String(p.primaryDoses),
    primaryIntervalWeeks: String(p.primaryIntervalWeeks),
    hasBooster: p.boosterIntervalMonths !== null,
    boosterIntervalMonths: p.boosterIntervalMonths === null ? "12" : String(p.boosterIntervalMonths),
  };
}

function toInput(f: FormState): VaccineProtocolInput {
  return {
    speciesCode: f.speciesCode,
    vaccineName: f.vaccineName.trim(),
    aliases: f.aliases.trim() || undefined,
    firstDoseAgeWeeks: f.hasPrimary ? Number(f.firstDoseAgeWeeks) : null,
    primaryDoses: f.hasPrimary ? Number(f.primaryDoses) || 1 : 1,
    primaryIntervalWeeks: f.hasPrimary ? Number(f.primaryIntervalWeeks) || 4 : 4,
    boosterIntervalMonths: f.hasBooster ? Number(f.boosterIntervalMonths) : null,
  };
}

/** Plain-language summary of a protocol, e.g. "3 doses from 6 weeks, 3 weeks apart; then every 12 months". */
function describe(p: VaccineProtocol): string {
  const parts: string[] = [];
  if (p.firstDoseAgeWeeks !== null) {
    parts.push(
      p.primaryDoses > 1
        ? `${p.primaryDoses} doses from ${p.firstDoseAgeWeeks} weeks of age, ${p.primaryIntervalWeeks} weeks apart`
        : `1 dose at ${p.firstDoseAgeWeeks} weeks of age`
    );
  }
  if (p.boosterIntervalMonths !== null) {
    parts.push(`${parts.length ? "then " : ""}every ${p.boosterIntervalMonths} month${p.boosterIntervalMonths === 1 ? "" : "s"}`);
  }
  return parts.join("; ");
}

export default function VaccineProtocolsPage() {
  const queryClient = useQueryClient();
  const protocols = useQuery({ queryKey: ["vaccine-protocols"], queryFn: listVaccineProtocols });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => (editingId ? updateVaccineProtocol(editingId, toInput(form)) : createVaccineProtocol(toInput(form))),
    onSuccess: async (saved) => {
      setMessage(`${editingId ? "Updated" : "Added"} ${saved.vaccineName}. Pets' schedules have been updated.`);
      setError(null);
      setForm(EMPTY_FORM);
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ["vaccine-protocols"] });
      await queryClient.invalidateQueries({ queryKey: ["vaccine-schedule"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save the protocol."),
  });

  const toggle = useMutation({
    mutationFn: (p: VaccineProtocol) => updateVaccineProtocolStatus(p.id, p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["vaccine-protocols"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not update the protocol."),
  });

  const formValid =
    form.vaccineName.trim().length > 0 &&
    (form.hasPrimary || form.hasBooster) &&
    (!form.hasPrimary || form.firstDoseAgeWeeks.trim() !== "") &&
    (!form.hasBooster || Number(form.boosterIntervalMonths) > 0);

  const grouped = SPECIES.map((s) => ({
    ...s,
    items: (protocols.data ?? []).filter((p) => p.speciesCode === s.code),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-6 pb-20">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Vaccine Protocols</h2>
        <p className="text-sm text-slate-500">
          Your clinic&apos;s vaccination schedule. New puppies and kittens get their schedule from these when registered with a date of
          birth, each recorded dose plans the next one, and WhatsApp reminders follow the schedule.
        </p>
      </div>

      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="border-b border-slate-100 pb-3 text-base font-bold text-slate-900">
            {editingId ? "Edit protocol" : "Add a vaccine"}
          </h3>

          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="vp-species">Species</label>
            <select
              id="vp-species"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
              value={form.speciesCode}
              onChange={(e) => setForm((f) => ({ ...f, speciesCode: e.target.value }))}
            >
              {SPECIES.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="vp-name">Vaccine name *</label>
            <input
              id="vp-name"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
              value={form.vaccineName}
              onChange={(e) => setForm((f) => ({ ...f, vaccineName: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600" htmlFor="vp-aliases">Other names on the card</label>
            <input
              id="vp-aliases"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
              placeholder="Comma separated brand or short names"
              value={form.aliases}
              onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
            />
            <span className="text-[11px] text-slate-500">A dose counts for this vaccine when its name contains any of these.</span>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.hasPrimary}
              onChange={(e) => setForm((f) => ({ ...f, hasPrimary: e.target.checked }))}
            />
            Puppy / kitten primary series
          </label>
          {form.hasPrimary && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-600" htmlFor="vp-age">First dose at (weeks)</label>
                <input id="vp-age" type="number" min="0" max="520" className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  value={form.firstDoseAgeWeeks} onChange={(e) => setForm((f) => ({ ...f, firstDoseAgeWeeks: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600" htmlFor="vp-doses">Doses</label>
                <input id="vp-doses" type="number" min="1" max="6" className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  value={form.primaryDoses} onChange={(e) => setForm((f) => ({ ...f, primaryDoses: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600" htmlFor="vp-gap">Weeks apart</label>
                <input id="vp-gap" type="number" min="1" max="26" className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
                  value={form.primaryIntervalWeeks} onChange={(e) => setForm((f) => ({ ...f, primaryIntervalWeeks: e.target.value }))} />
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.hasBooster}
              onChange={(e) => setForm((f) => ({ ...f, hasBooster: e.target.checked }))}
            />
            Repeat booster
          </label>
          {form.hasBooster && (
            <div className="flex items-center gap-2 text-sm">
              <span>Every</span>
              <input type="number" min="1" max="60" className="w-20 rounded-md border border-slate-300 p-2 text-sm"
                aria-label="Booster interval in months"
                value={form.boosterIntervalMonths} onChange={(e) => setForm((f) => ({ ...f, boosterIntervalMonths: e.target.value }))} />
              <span>months</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              className="flex-1 bg-teal-700 text-white hover:bg-teal-800"
              disabled={!formValid || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : editingId ? "Save changes" : "Add vaccine"}
            </Button>
            {editingId && (
              <Button variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>
                Cancel
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          {protocols.isLoading ? (
            <p className="py-8 text-sm text-slate-500">Loading protocols…</p>
          ) : grouped.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No vaccines yet. Add the vaccines your clinic gives, with your own schedule, on the left.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {grouped.map((group) => (
                <div key={group.code}>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{group.label}</h3>
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {group.items.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                        <div className={p.status === "ACTIVE" ? "" : "opacity-50"}>
                          <p className="font-semibold text-slate-900">{p.vaccineName}</p>
                          <p className="text-xs text-slate-600">{describe(p)}</p>
                          {p.aliases && <p className="text-[11px] text-slate-400">Also: {p.aliases}</p>}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setEditingId(p.id); setForm(toForm(p)); setMessage(null); }}>
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate(p)}>
                            {p.status === "ACTIVE" ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
