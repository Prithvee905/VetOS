"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { currentUser, logout, searchGlobal, listBranches, type SessionUser, type SearchResults, type Branch } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { NotificationBell } from "@/components/notification-bell";

type NavLink = {
  href: string;
  label: string;
  allowedRoles: string[];
};

const links: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", allowedRoles: ["OWNER", "DOCTOR", "RECEPTIONIST", "STAFF"] },
  { href: "/patients", label: "Patients & Records", allowedRoles: ["OWNER", "DOCTOR", "RECEPTIONIST", "STAFF"] },
  { href: "/clinic", label: "Queue & Clinical", allowedRoles: ["OWNER", "DOCTOR", "RECEPTIONIST", "STAFF"] },
  { href: "/inventory", label: "Inventory", allowedRoles: ["OWNER", "DOCTOR", "RECEPTIONIST", "STAFF"] },
  { href: "/specialties", label: "Specialties", allowedRoles: ["OWNER", "DOCTOR", "RECEPTIONIST", "STAFF"] },
  { href: "/communications", label: "Comms & PRM", allowedRoles: ["OWNER", "RECEPTIONIST"] },
  { href: "/leads", label: "Leads CRM", allowedRoles: ["OWNER", "RECEPTIONIST"] },
  { href: "/procurement", label: "Procurement", allowedRoles: ["OWNER"] },
  { href: "/analytics", label: "Financials", allowedRoles: ["OWNER"] },
  { href: "/settings/clinic", label: "Settings", allowedRoles: ["OWNER"] },
];

const settingsSubLinks = [
  { href: "/settings/clinic", label: "Clinic Profile" },
  { href: "/settings/services", label: "Services Catalog" },
  { href: "/settings/vaccines", label: "Vaccine Protocols" },
  { href: "/settings/exports", label: "Data Exports" },
  { href: "/settings/audit", label: "Audit Trail" },
  { href: "/settings/production", label: "Production Gates" },
  { href: "/settings/users", label: "Users & Staff" },
];

const ROUTE_RULES: { prefix: string; allowedRoles: string[]; title: string }[] = [
  { prefix: "/analytics", allowedRoles: ["OWNER"], title: "Financial Ledger & Executive Analytics" },
  { prefix: "/procurement", allowedRoles: ["OWNER"], title: "Procurement & Vendor Management" },
  { prefix: "/settings", allowedRoles: ["OWNER"], title: "Clinic Administration & Settings" },
  { prefix: "/leads", allowedRoles: ["OWNER", "RECEPTIONIST"], title: "Client Acquisition CRM" },
  { prefix: "/communications", allowedRoles: ["OWNER", "RECEPTIONIST"], title: "Communications & PRM Hub" },
  { prefix: "/specialties", allowedRoles: ["OWNER", "DOCTOR", "RECEPTIONIST", "STAFF"], title: "Specialties & Clinical Procedures" },
  { prefix: "/inventory", allowedRoles: ["OWNER", "DOCTOR", "RECEPTIONIST", "STAFF"], title: "Inventory Management" },
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
    staleTime: 5 * 60 * 1000,
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

  const branchesQuery = useQuery({
    queryKey: ["branches"],
    queryFn: () => listBranches(),
  });
  const branchesList = branchesQuery.data?.items ?? [];

  const [activeBranchId, setActiveBranchId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("vetos_active_branch_id") || "";
    }
    return "";
  });

  useEffect(() => {
    if (branchesList.length > 0) {
      const match = branchesList.find((b) => b.id === activeBranchId);
      if (!match) {
        const defaultId = branchesList[0].id;
        setActiveBranchId(defaultId);
        if (typeof window !== "undefined") {
          localStorage.setItem("vetos_active_branch_id", defaultId);
        }
      }
    }
  }, [branchesList, activeBranchId]);

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === "vetos_active_branch_id" && e.newValue) {
        setActiveBranchId(e.newValue);
      }
    }
    function handleCustomEvent(e: Event) {
      const custom = e as CustomEvent<{ branchId: string }>;
      if (custom.detail?.branchId) {
        setActiveBranchId(custom.detail.branchId);
      }
    }
    window.addEventListener("storage", handleStorage);
    window.addEventListener("vetos-branch-changed", handleCustomEvent);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("vetos-branch-changed", handleCustomEvent);
    };
  }, []);

  function handleBranchSwitch(branchId: string) {
    if (!session.data?.roles.includes("OWNER")) return;
    setActiveBranchId(branchId);
    if (typeof window !== "undefined") {
      localStorage.setItem("vetos_active_branch_id", branchId);
      window.dispatchEvent(new CustomEvent("vetos-branch-changed", { detail: { branchId } }));
    }
  }

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
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {user.roles.includes("DOCTOR") && !isOwner && title === "Inventory & Stock Management"
              ? "Medicines & Pharmacy"
              : title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Global Multi-Branch Switcher (Owner only; static badge for Doctor/Staff/Receptionist) */}
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-2xs">
            <span className="text-xs font-bold text-teal-700">📍</span>
            <span className="text-xs font-semibold text-slate-500 hidden sm:inline">Branch:</span>
            {isOwner ? (
              <>
                <select
                  id="global-branch-switcher"
                  aria-label="Active Clinic Branch"
                  className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
                  value={activeBranchId}
                  onChange={(e) => handleBranchSwitch(e.target.value)}
                >
                  {branchesList.length === 0 ? (
                    <option value="">Loading branches…</option>
                  ) : (
                    branchesList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))
                  )}
                </select>
                <Link
                  href="/settings/clinic"
                  className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 ml-1 border-l border-slate-200 pl-2"
                  title="Manage clinic locations & add new branches"
                >
                  + Add / Manage
                </Link>
              </>
            ) : (
              <span className="text-xs font-bold text-slate-800 px-1">
                {branchesList.find((b) => b.id === activeBranchId)?.name || "Main"}
              </span>
            )}
          </div>

          <NotificationBell />

          {/* Omni-Search */}
          <div ref={searchRef} className="relative w-64 sm:w-72">
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
                            <p className="text-xs text-slate-500">{formatMoney(pr.salePrice)}</p>
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

      {/* Main navigation filtered by user roles */}
      <nav className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
        {links
          .filter((link) => user.roles.some((role) => link.allowedRoles.includes(role)))
          .map((link) => {
            const isDoctor = user.roles.includes("DOCTOR") && !isOwner;
            const displayLabel = link.href === "/inventory" && isDoctor ? "Medicines & Stock" : link.label;
            const active =
              pathname === link.href ||
              (link.href === "/settings/clinic" && pathname.startsWith("/settings")) ||
              (link.href !== "/clinic" && link.href !== "/settings/clinic" && pathname.startsWith(link.href + "/"));
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
                {displayLabel}
              </Link>
            );
          })}
      </nav>

      {/* Settings Sub-Navigation */}
      {pathname.startsWith("/settings") && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 bg-slate-50/80 px-3 py-2 rounded-lg">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">Settings Module:</span>
          {settingsSubLinks.map((sub) => {
            const active = pathname === sub.href;
            return (
              <Link
                key={sub.href}
                href={sub.href}
                className={
                  active
                    ? "rounded-md bg-teal-700 px-2.5 py-1 text-xs font-bold text-white shadow-xs"
                    : "rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition"
                }
              >
                {sub.label}
              </Link>
            );
          })}
        </div>
      )}

      <main className="flex-1">
        {(() => {
          const currentRule = ROUTE_RULES.find((rule) => pathname === rule.prefix || pathname.startsWith(rule.prefix + "/"));
          const isAuthorized = !currentRule || user.roles.some((role) => currentRule.allowedRoles.includes(role));

          if (!isAuthorized) {
            return (
              <div className="mx-auto my-12 max-w-xl rounded-2xl border border-amber-200 bg-amber-50/70 p-8 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-10V4m0 0a4 4 0 00-4 4v3H7a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V8a4 4 0 00-4-4z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-amber-950">Access Restricted</h2>
                <p className="mt-2 text-sm text-amber-800">
                  The <strong>{currentRule?.title}</strong> section is reserved for authorized clinic roles ({currentRule?.allowedRoles.join(", ")}).
                </p>
                <p className="mt-1 text-xs text-amber-700/80">
                  Your active role ({user.roles.join(", ")}) does not have access permissions for this module.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/dashboard"
                    className="rounded-lg bg-teal-800 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-900 transition"
                  >
                    Back to Dashboard
                  </Link>
                  <Link
                    href="/clinic"
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
                  >
                    Go to Clinical Queue
                  </Link>
                </div>
              </div>
            );
          }

          return children;
        })()}
      </main>
    </div>
  );
}
