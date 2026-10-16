"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiJson, createBranch, listBranches, type ClinicProfile, type Branch } from "@/lib/api";

export default function ClinicSettingsPage() {
  const client = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [branchName, setBranchName] = useState("");
  const clinic = useQuery({
    queryKey: ["clinic"],
    queryFn: () => apiJson<ClinicProfile>("/api/v1/clinic"),
  });
  const branches = useQuery({
    queryKey: ["branches"],
    queryFn: () => listBranches(),
  });
  const [form, setForm] = useState<Partial<ClinicProfile>>({});

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiJson<ClinicProfile>("/api/v1/clinic", { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: (data) => {
      client.setQueryData(["clinic"], data);
      setForm({});
      setMessage("Clinic profile saved.");
    },
    onError: (error: Error) => {
      client.invalidateQueries({ queryKey: ["clinic"] });
      setMessage(error.message);
    },
  });

  const addBranch = useMutation({
    mutationFn: () => createBranch({ name: branchName.trim() }),
    onSuccess: (newBranch) => {
      client.invalidateQueries({ queryKey: ["branches"] });
      setBranchName("");
      setMessage(`Branch created: ${newBranch.name}`);
    },
    onError: (error: Error) => {
      setMessage(error.message);
    },
  });

  if (clinic.isLoading) {
    return <p className="text-slate-600">Loading clinic profile…</p>;
  }

  const profile = clinic.data;
  if (clinic.isError || !profile) {
    return <p className="text-rose-700">Could not load the clinic profile.</p>;
  }

  const values = { ...profile, ...form };

  return (
    <div className="flex flex-col gap-10">
      <section className="flex max-w-xl flex-col gap-4">
        <h2 className="text-lg font-medium">Clinic profile</h2>
        {message ? <p className="text-sm text-slate-700">{message}</p> : null}
        <label className="text-sm font-medium" htmlFor="name">
          Clinic Name
        </label>
        <input
          id="name"
          className="rounded-md border border-slate-300 px-3 py-2"
          value={values.name ?? ""}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        />
        <label className="text-sm font-medium" htmlFor="phone">
          Phone
        </label>
        <input
          id="phone"
          className="rounded-md border border-slate-300 px-3 py-2"
          value={values.phone ?? ""}
          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
        />
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="rounded-md border border-slate-300 px-3 py-2"
          type="email"
          value={values.email ?? ""}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
        />

        {/* Discount & Pricing Rules */}
        <div className="rounded-xl bg-teal-50/60 border border-teal-200 p-4 space-y-4">
          <div>
            <label className="text-sm font-bold text-teal-950 flex items-center justify-between" htmlFor="maxDiscount">
              <span>🛡️ Counter Staff Discount Cap</span>
              <span className="text-xs font-semibold text-teal-700">Standard Clients</span>
            </label>
            <p className="text-xs text-teal-800 mt-0.5">
              Maximum discount percentage that receptionists and counter staff are allowed to grant for standard clients. Staff cannot exceed this limit without owner override.
            </p>
            <div className="flex items-center gap-2 pt-1.5">
              <input
                id="maxDiscount"
                type="number"
                min="0"
                max="100"
                step="1"
                className="w-24 rounded-md border border-teal-300 bg-white px-3 py-1.5 text-sm font-bold text-teal-950 shadow-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
                value={values.maxStaffDiscountPercent ?? 20}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxStaffDiscountPercent: parseFloat(event.target.value) || 0,
                  }))
                }
              />
              <span className="text-sm font-bold text-teal-900">% Max Allowed</span>
            </div>
          </div>

          <div className="border-t border-teal-200/70 pt-3">
            <label className="text-sm font-bold text-teal-950 flex items-center justify-between" htmlFor="loyalDiscount">
              <span>⭐ Loyal Customers Discount Cap</span>
              <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">Tier 1: Loyal</span>
            </label>
            <p className="text-xs text-teal-800 mt-0.5">
              Maximum discount percentage eligible for registered repeat & loyal customers (default 30% flat discount policy).
            </p>
            <div className="flex items-center gap-2 pt-1.5">
              <input
                id="loyalDiscount"
                type="number"
                min="0"
                max="100"
                step="1"
                className="w-24 rounded-md border border-teal-300 bg-white px-3 py-1.5 text-sm font-bold text-teal-950 shadow-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
                value={values.loyalDiscountPercent ?? 30}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    loyalDiscountPercent: parseFloat(event.target.value) || 0,
                  }))
                }
              />
              <span className="text-sm font-bold text-teal-900">% Max for Loyal Category</span>
            </div>
          </div>

          <div className="border-t border-teal-200/70 pt-3">
            <label className="text-sm font-bold text-teal-950 flex items-center justify-between" htmlFor="ngoDiscount">
              <span>🐾 NGO / Community Rescue Consultation Discount</span>
              <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">Tier 2: NGO</span>
            </label>
            <p className="text-xs text-teal-800 mt-0.5">
              Discount percentage applied exclusively to Consultation & Clinical Procedure fees for people rescuing street / stray animals.
            </p>
            <div className="flex items-center gap-2 pt-1.5">
              <input
                id="ngoDiscount"
                type="number"
                min="0"
                max="100"
                step="1"
                className="w-24 rounded-md border border-teal-300 bg-white px-3 py-1.5 text-sm font-bold text-teal-950 shadow-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
                value={values.ngoConsultationDiscountPercent ?? 50}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    ngoConsultationDiscountPercent: parseFloat(event.target.value) || 0,
                  }))
                }
              />
              <span className="text-sm font-bold text-teal-900">% Flat on Consultation Fee</span>
            </div>
          </div>

          <div className="border-t border-teal-200/70 pt-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                id="allowMedicineDiscount"
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-teal-300 text-teal-700 focus:ring-teal-500"
                checked={values.allowMedicineDiscount ?? false}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    allowMedicineDiscount: event.target.checked,
                  }))
                }
              />
              <div>
                <span className="text-sm font-bold text-teal-950">
                  Allow Discounts on Medicines & Retail Pharmaceuticals
                </span>
                <p className="text-xs text-teal-800 mt-0.5">
                  When <strong>disabled</strong> (recommended), customer discounts are applied strictly to Consultation and Clinical Services, protecting your pharmacy inventory margins. When <strong>enabled</strong>, staff can extend percentage discounts to medicines.
                </p>
              </div>
            </label>
          </div>
        </div>

        <Button
          type="button"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              version: profile.version,
              name: values.name,
              phone: values.phone || null,
              email: values.email || null,
              maxStaffDiscountPercent: values.maxStaffDiscountPercent ?? 20,
              loyalDiscountPercent: values.loyalDiscountPercent ?? 30,
              ngoConsultationDiscountPercent: values.ngoConsultationDiscountPercent ?? 50,
              allowMedicineDiscount: values.allowMedicineDiscount ?? false,
            })
          }
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
      </section>

      <section className="flex max-w-xl flex-col gap-4 border-t border-slate-200 pt-6">
        <h2 className="text-lg font-medium">Clinic Branches / Locations</h2>
        <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
          {(branches.data?.items ?? []).map((b: Branch) => (
            <div key={b.id} className="flex items-center justify-between p-3 text-sm">
              <span className="font-semibold text-slate-800">{b.name}</span>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-bold">{b.status}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-2">
          <input
            placeholder="New branch name (e.g. Downtown Facility)"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
          />
          <Button
            type="button"
            disabled={!branchName.trim() || addBranch.isPending}
            onClick={() => addBranch.mutate()}
          >
            {addBranch.isPending ? "Creating…" : "Add Branch"}
          </Button>
        </div>
      </section>
    </div>
  );
}
