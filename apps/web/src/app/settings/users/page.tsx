"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiJson, currentUser, type UserRow } from "@/lib/api";

type UserPage = {
  items: UserRow[];
  page: number;
  size: number;
  hasNext: boolean;
};

const roles = ["OWNER", "DOCTOR", "RECEPTIONIST", "STAFF"] as const;

export default function UsersSettingsPage() {
  const router = useRouter();
  const client = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: currentUser, retry: false });
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => apiJson<UserPage>("/api/v1/users"),
    enabled: session.data?.roles.includes("OWNER") ?? false,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "RECEPTIONIST" as (typeof roles)[number],
  });

  const createUser = useMutation({
    mutationFn: () =>
      apiJson<UserRow>("/api/v1/users", {
        method: "POST",
        body: JSON.stringify({
          email: draft.email,
          password: draft.password,
          displayName: draft.displayName,
          roles: [draft.role],
        }),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["users"] });
      setDraft({ email: "", password: "", displayName: "", role: "RECEPTIONIST" });
      setMessage("User created.");
    },
    onError: (error: Error) => setMessage(error.message),
  });

  if (session.isLoading) {
    return <p className="text-slate-600">Loading…</p>;
  }

  if (!session.data?.roles.includes("OWNER")) {
    router.replace("/settings/clinic");
    return null;
  }

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-medium">Users</h2>
        {message ? <p className="mt-2 text-sm text-slate-700">{message}</p> : null}
        {users.isLoading ? <p className="mt-4 text-slate-600">Loading users…</p> : null}
        {users.isError ? <p className="mt-4 text-rose-700">Could not load users.</p> : null}
        {users.data ? (
          <ul className="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200">
            {users.data.items.map((user) => (
              <li key={user.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                <span className="font-medium">{user.displayName}</span>
                <span className="text-slate-600">{user.email}</span>
                <span className="text-slate-500">
                  {user.roles.join(", ")} · {user.status}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <form
        className="flex max-w-md flex-col gap-3 rounded-md border border-slate-200 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          createUser.mutate();
        }}
      >
        <h3 className="font-medium">Add user</h3>
        <input
          id="user-email"
          className="rounded-md border border-slate-300 px-3 py-2"
          placeholder="Email"
          type="email"
          required
          value={draft.email}
          onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))}
        />
        <input
          id="user-display-name"
          className="rounded-md border border-slate-300 px-3 py-2"
          placeholder="Display name"
          required
          value={draft.displayName}
          onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
        />
        <input
          id="user-password"
          className="rounded-md border border-slate-300 px-3 py-2"
          placeholder="Temporary password"
          type="password"
          minLength={8}
          required
          value={draft.password}
          onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))}
        />
        <select
          id="user-role-select"
          className="rounded-md border border-slate-300 px-3 py-2"
          value={draft.role}
          onChange={(event) =>
            setDraft((current) => ({ ...current, role: event.target.value as (typeof roles)[number] }))
          }
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <Button id="btn-create-user" type="submit" disabled={createUser.isPending}>
          {createUser.isPending ? "Creating…" : "Create user"}
        </Button>
      </form>
    </section>
  );
}
