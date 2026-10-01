"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiJson, type ClinicProfile } from "@/lib/api";

export default function ClinicSettingsPage() {
  const client = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const clinic = useQuery({
    queryKey: ["clinic"],
    queryFn: () => apiJson<ClinicProfile>("/api/v1/clinic"),
  });
  const [form, setForm] = useState<Partial<ClinicProfile>>({});

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiJson<ClinicProfile>("/api/v1/clinic", { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: (data) => {
      client.setQueryData(["clinic"], data);
      setMessage("Clinic profile saved.");
    },
    onError: (error: Error) => setMessage(error.message),
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
    <section className="flex max-w-xl flex-col gap-4">
      <h2 className="text-lg font-medium">Clinic profile</h2>
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      <label className="text-sm font-medium" htmlFor="name">
        Name
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
      <Button
        type="button"
        disabled={save.isPending}
        onClick={() =>
          save.mutate({
            version: profile.version,
            name: values.name,
            phone: values.phone || null,
            email: values.email || null,
          })
        }
      >
        {save.isPending ? "Saving…" : "Save changes"}
      </Button>
    </section>
  );
}
