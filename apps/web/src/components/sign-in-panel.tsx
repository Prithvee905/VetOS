"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PawPrint } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { login } from "@/lib/api";
import { useUiStore } from "@/lib/ui-store";

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

type SignInValues = z.infer<typeof signInSchema>;

export function SignInPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const dismissNotice = useUiStore((state) => state.dismissNotice);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6">
      <div className="flex items-center gap-3">
        <PawPrint className="text-teal-700" aria-hidden="true" />
        <h1 className="text-3xl font-semibold tracking-tight">VetOS</h1>
      </div>
      <p className="text-slate-600">Sign in with your clinic account.</p>
      <p className="text-sm text-slate-500">
        Dev stack (after <code className="text-xs">docker compose up</code>):{" "}
        <span className="font-mono">owner@clinic.test</span> / <span className="font-mono">change-me-now</span>
      </p>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {form.formState.errors.email ? (
        <p className="text-sm text-rose-700">{form.formState.errors.email.message}</p>
      ) : null}
      {form.formState.errors.password ? (
        <p className="text-sm text-rose-700">{form.formState.errors.password.message}</p>
      ) : null}
      <form
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit(async (values) => {
          setSubmitting(true);
          setError(null);
          try {
            const session = await login(values.email, values.password);
            queryClient.setQueryData(["session"], session);
            dismissNotice();
            router.push("/dashboard");
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Sign-in failed.");
          } finally {
            setSubmitting(false);
          }
        })}
      >
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="rounded-md border border-slate-300 px-3 py-2"
          type="email"
          autoComplete="username"
          {...form.register("email")}
        />
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="rounded-md border border-slate-300 px-3 py-2"
          type="password"
          autoComplete="current-password"
          {...form.register("password")}
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
