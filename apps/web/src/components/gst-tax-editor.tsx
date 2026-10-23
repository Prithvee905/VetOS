"use client";

import { useState } from "react";

/** Common Indian GST slabs; vets mostly use 0, 5, 12 and 18. */
export const GST_SLABS = [0, 5, 12, 18, 28];

type Props = {
  code: string | null | undefined;
  rate: number | null | undefined;
  codeLabel: string;
  onSave: (code: string, rate: number) => Promise<unknown>;
};

/** Shows "HSN 3004 · 12%" and lets catalog managers change it in place. */
export function GstTaxEditor({ code, rate, codeLabel, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draftCode, setDraftCode] = useState(code ?? "");
  const [draftRate, setDraftRate] = useState(String(rate ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <button
        type="button"
        className="text-left text-xs text-slate-600 hover:text-teal-800"
        title="Edit GST"
        onClick={() => {
          setDraftCode(code ?? "");
          setDraftRate(String(rate ?? 0));
          setError(null);
          setEditing(true);
        }}
      >
        <span className="font-semibold">{Number(rate ?? 0)}%</span>
        <span className="block font-mono text-[11px] text-slate-400">{code ? `${codeLabel} ${code}` : `No ${codeLabel}`}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <select
          className="rounded border border-slate-300 px-1 py-0.5 text-xs"
          value={draftRate}
          onChange={(e) => setDraftRate(e.target.value)}
        >
          {GST_SLABS.map((slab) => (
            <option key={slab} value={slab}>
              {slab}%
            </option>
          ))}
        </select>
        <input
          className="w-20 rounded border border-slate-300 px-1 py-0.5 font-mono text-xs"
          placeholder={codeLabel}
          maxLength={16}
          value={draftCode}
          onChange={(e) => setDraftCode(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          className="font-semibold text-teal-700 disabled:opacity-50"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              await onSave(draftCode.trim(), Number(draftRate));
              setEditing(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className="text-slate-500" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {error ? <span className="text-[11px] text-rose-700">{error}</span> : null}
    </div>
  );
}
