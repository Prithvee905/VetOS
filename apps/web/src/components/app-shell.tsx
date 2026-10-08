"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { currentUser, logout, searchGlobal, type SessionUser, type SearchResults } from "@/lib/api";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/patients", label: "Patients & Records" },
  { href: "/clinic", label: "Queue & Clinical" },
  { href: "/pharmacy", label: "Pharmacy" },
  { href: "/inventory", label: "Inventory" },
  { href: "/procurement", label: "Procurement" },
  { href: "/specialties", label: "Specialties" },
  { href: "/communications", label: "Comms & PRM" },
  { href: "/leads", label: "Leads CRM" },
  { href: "/analytics", label: "Financials" },
  { href: "/settings/clinic", label: "Settings" },
  { href: "/settings/services", label: "Services Catalog" },
  { href: "/settings/audit", label: "Audit Trail", ownerOnly: true },
  { href: "/settings/users", label: "Users", ownerOnly: true },
];

export function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const session = useQuery({
    queryKey: ["session"],
    queryFn: currentUser,
    retry: false,
  });

  const searchResults = useQuery({
    queryKey: ["global-search", searchQuery],
    queryFn: () => searchGlobal(searchQuery),
    enabled: searchQuery.trim().length >= 2,
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (session.isLoading) {
    return <p className="mx-auto max-w-6xl px-6 py-10 text-slate-600">Loading session…</p>;
  }

  if (session.isError) {
    router.replace("/");
    return null;
  }

  const user = session.data as SessionUser;
  const isOwner = user.roles.includes("OWNER");

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              ClinicOS Active
            </span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs text-slate-500">
              {user.displayName} ({user.roles.join(", ")})
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{title}</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Omni-Search */}
          <div ref={searchRef} className="relative w-72">
            <input
              type="text"
              placeholder="Search pets, owners, items…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
            {searchOpen && searchQuery.trim().length >= 2 && searchResults.data && (
              <div className="absolute right-0 top-full z-50 mt-1 max-h-96 w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                {searchResults.data.patients.length === 0 &&
                searchResults.data.clients.length === 0 &&
                searchResults.data.products.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-500">No matches found</p>
                ) : (
                  <div className="space-y-3">
                    {searchResults.data.patients.length > 0 && (
                      <div>
                        <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Patients</p>
                        {searchResults.data.patients.map((p) => (
                          <Link
                            key={p.id}
                            href={`/patients?selected=${p.id}`}
                            onClick={() => setSearchOpen(false)}
                            className="block rounded px-2 py-1.5 hover:bg-teal-50"
                          >
                            <p className="text-sm font-medium text-slate-900">{p.name} ({p.species})</p>
                            <p className="text-xs text-slate-500">Owner: {p.clientName}</p>
                          </Link>
                        ))}
                      </div>
                    )}
                    {searchResults.data.clients.length > 0 && (
                      <div>
                        <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Owners</p>
                        {searchResults.data.clients.map((c) => (
                          <div key={c.id} className="rounded px-2 py-1.5 hover:bg-slate-50">
                            <p className="text-sm font-medium text-slate-900">{c.displayName}</p>
                            <p className="text-xs text-slate-500">{c.phone || c.email || "No contact"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {searchResults.data.products.length > 0 && (
                      <div>
                        <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Products</p>
                        {searchResults.data.products.map((pr) => (
                          <div key={pr.id} className="rounded px-2 py-1.5 hover:bg-slate-50">
                            <p className="text-sm font-medium text-slate-900">{pr.name} ({pr.sku})</p>
                            <p className="text-xs text-slate-500">${pr.salePrice}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              await logout();
              router.replace("/");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      {/* Main navigation */}
      <nav className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
        {links
          .filter((link) => !link.ownerOnly || isOwner)
          .map((link) => {
            const active = pathname === link.href || (link.href !== "/clinic" && pathname.startsWith(link.href + "/"));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "rounded-md bg-teal-800 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                    : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                }
              >
                {link.label}
              </Link>
            );
          })}
      </nav>

      <main className="flex-1">{children}</main>
    </div>
  );
}
