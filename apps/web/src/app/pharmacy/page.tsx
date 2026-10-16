"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PharmacyPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/clinic");
  }, [router]);

  return (
    <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      <p className="text-xs font-semibold text-slate-700">
        Redirecting to Queue & Clinical POS Counter…
      </p>
      <p className="text-[11px] text-slate-400">
        Medicine dispensing is fully automated upon counter billing.
      </p>
    </div>
  );
}
