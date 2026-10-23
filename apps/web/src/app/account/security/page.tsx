"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  beginTwoStepSetup,
  disableTwoStep,
  enableTwoStep,
  getTwoStepStatus,
  refreshSession,
  renewRecoveryCodes,
  type TwoStepSetup,
} from "@/lib/api";

function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-bold text-amber-900">Save these recovery codes now</p>
      <p className="mt-1 text-xs text-amber-800">
        Each code signs you in once if you lose your phone. They will not be shown again. Print them or keep them somewhere safe
        (not on the same phone).
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <li key={c} className="rounded bg-white px-2 py-1 text-center">{c}</li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>
        Copy codes
      </Button>
    </div>
  );
}

export default function AccountSecurityPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["two-step-status"], queryFn: getTwoStepStatus });
  const [setup, setSetup] = useState<TwoStepSetup | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDisable, setShowDisable] = useState(false);

  const start = useMutation({
    mutationFn: beginTwoStepSetup,
    onSuccess: (data) => {
      setSetup(data);
      setCode("");
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not start setup."),
  });

  const enable = useMutation({
    mutationFn: () => enableTwoStep(code),
    onSuccess: async (data) => {
      setCodes(data.recoveryCodes);
      setSetup(null);
      setCode("");
      setError(null);
      // New session cookie without the "setup required" flag.
      const session = await refreshSession();
      queryClient.setQueryData(["session"], session);
      await queryClient.invalidateQueries({ queryKey: ["two-step-status"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "That code did not work."),
  });

  const renew = useMutation({
    mutationFn: () => renewRecoveryCodes(code),
    onSuccess: async (data) => {
      setCodes(data.recoveryCodes);
      setCode("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["two-step-status"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "That code did not work."),
  });

  const disable = useMutation({
    mutationFn: () => disableTwoStep(password, code),
    onSuccess: async () => {
      setShowDisable(false);
      setPassword("");
      setCode("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["two-step-status"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not turn off two-step login."),
  });

  if (status.isLoading) {
    return <p className="text-slate-600">Loading…</p>;
  }
  const s = status.data;

  return (
    <div className="flex max-w-2xl flex-col gap-6 pb-20">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Two-step login</h2>
        <p className="text-sm text-slate-500">
          After your password, VetOS asks for a 6-digit code from an authenticator app on your phone (Google Authenticator,
          Microsoft Authenticator, Authy). Someone who learns your password still cannot sign in.
        </p>
      </div>

      {s?.required && !s.enabled && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Your clinic requires two-step login for your role. Set it up below to continue using VetOS.
        </div>
      )}
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {codes && <RecoveryCodes codes={codes} />}
      {codes && s?.enabled && (
        <Button type="button" className="self-start" onClick={() => router.push("/dashboard")}>
          I&apos;ve saved my codes — continue
        </Button>
      )}

      {s?.enabled ? (
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm">
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">ON</span>{" "}
            Two-step login is on. Recovery codes left: <strong>{s.recoveryCodesLeft}</strong>
          </p>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-600" htmlFor="current-code">Current code from your app</label>
            <input
              id="current-code"
              className="w-40 rounded-md border border-slate-300 px-3 py-2 text-center font-mono tracking-widest"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={code.length !== 6 || renew.isPending} onClick={() => renew.mutate()}>
              New recovery codes
            </Button>
            {!s.required && (
              <Button type="button" variant="outline" onClick={() => setShowDisable((v) => !v)}>
                Turn off
              </Button>
            )}
          </div>
          {showDisable && (
            <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
              <label className="text-xs font-semibold text-slate-600" htmlFor="disable-password">Your password</label>
              <input
                id="disable-password"
                type="password"
                autoComplete="current-password"
                className="w-64 rounded-md border border-slate-300 px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                className="self-start bg-rose-700 text-white hover:bg-rose-800"
                disabled={!password || code.length !== 6 || disable.isPending}
                onClick={() => disable.mutate()}
              >
                Turn off two-step login
              </Button>
            </div>
          )}
        </div>
      ) : setup ? (
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>Open your authenticator app and add a new account.</li>
            <li>Scan this QR code (or type the key below).</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          {/* The SVG is generated by our API from the enrollment URI only. */}
          <div className="h-48 w-48 self-center" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
          <p className="break-all text-center font-mono text-xs text-slate-600">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
          <div className="flex items-end gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-600" htmlFor="setup-code">Code from the app</label>
              <input
                id="setup-code"
                className="mt-1 w-40 rounded-md border border-slate-300 px-3 py-2 text-center font-mono tracking-widest"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <Button type="button" disabled={code.length !== 6 || enable.isPending} onClick={() => enable.mutate()}>
              {enable.isPending ? "Checking…" : "Turn on"}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" className="self-start" disabled={start.isPending} onClick={() => start.mutate()}>
          Set up two-step login
        </Button>
      )}
    </div>
  );
}
