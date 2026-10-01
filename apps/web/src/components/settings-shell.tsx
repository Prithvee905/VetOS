"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { currentUser, logout, type SessionUser } from "@/lib/api";

const links = [
  { href: "/settings/clinic", label: "Clinic profile" },
  { href: "/settings/users", label: "Users", ownerOnly: true },
];

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: currentUser,
    retry: false,
  });

  if (session.isLoading) {
    return <p className="mx-auto max-w-3xl px-6 py-10 text-slate-600">Loading session…</p>;
  }

  if (session.isError) {
    router.replace("/");
    return null;
  }

  const user = session.data as SessionUser;
  const isOwner = user.roles.includes("OWNER");

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-sm text-slate-500">Signed in as {user.displayName}</p>
          <h1 className="text-2xl font-semibold">Clinic settings</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await logout();
            router.replace("/");
          }}
        >
          Sign out
        </Button>
      </header>
      <nav className="flex flex-wrap gap-2">
        {links
          .filter((link) => !link.ownerOnly || isOwner)
          .map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                pathname === link.href
                  ? "rounded-md bg-teal-700 px-3 py-2 text-sm text-white"
                  : "rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
              }
            >
              {link.label}
            </Link>
          ))}
      </nav>
      {children}
    </div>
  );
}
