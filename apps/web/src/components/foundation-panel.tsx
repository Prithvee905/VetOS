"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/lib/ui-store";

const signInSchema = z.object({
  email: z.email(),
});

type SignInValues = z.infer<typeof signInSchema>;

export function FoundationPanel() {
  const noticeDismissed = useUiStore((state) => state.noticeDismissed);
  const dismissNotice = useUiStore((state) => state.dismissNotice);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "" },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6">
      <div className="flex items-center gap-3">
        <PawPrint className="text-teal-700" aria-hidden="true" />
        <h1 className="text-3xl font-semibold tracking-tight">VetOS</h1>
      </div>
      <p className="text-slate-600">Clinic operating system. Sign-in is served by the API.</p>
      {noticeDismissed ? null : (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Clinical, billing, and payment workflows are not in this build.
        </p>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit(() => {
          dismissNotice();
        })}
      >
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="rounded-md border border-slate-300 px-3 py-2"
          type="email"
          {...form.register("email")}
        />
        <Button type="submit">Continue</Button>
      </form>
    </main>
  );
}
