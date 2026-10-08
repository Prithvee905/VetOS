"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createService,
  listServices,
  updateServiceStatus,
  type ServiceItem,
} from "@/lib/api";

export default function ServicesCatalogPage() {
  const queryClient = useQueryClient();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("500");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const services = useQuery({
    queryKey: ["services"],
    queryFn: listServices,
  });

  const createServiceMutation = useMutation({
    mutationFn: () =>
      createService({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        defaultPrice: Number(defaultPrice) || 0,
      }),
    onSuccess: async (created) => {
      setMessage(`Service added: ${created.name} (${created.code})`);
      setError(null);
      setCode("");
      setName("");
      setDefaultPrice("500");
      await queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to create service"),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateServiceStatus(id, status),
    onSuccess: async (_, { status }) => {
      setMessage(`Service marked ${status}`);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to update service status"),
  });

  return (
    <div className="flex flex-col gap-6 pb-20">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Clinic Services Catalog</h2>
        <p className="text-sm text-slate-500">
          Manage clinical procedure codes, standardized treatment services, and default pricing.
        </p>
      </div>

      {message && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Add Service Form */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">New Service Item</h3>

          <div>
            <label className="text-xs font-semibold text-slate-600">Service Code *</label>
            <input
              type="text"
              placeholder="e.g. VAX-RABIES, DENTAL-SCALE"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm uppercase font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Service Description / Name *</label>
            <input
              type="text"
              placeholder="e.g. Annual Rabies Booster Vaccination"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Default Standard Price ($) *</label>
            <input
              type="number"
              placeholder="500"
              className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(e.target.value)}
            />
          </div>

          <Button
            className="mt-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold"
            onClick={() => createServiceMutation.mutate()}
            disabled={!code || !name || createServiceMutation.isPending}
          >
            {createServiceMutation.isPending ? "Adding…" : "Save Service to Catalog →"}
          </Button>
        </div>

        {/* Right: Services List Table */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Standard Catalog Items ({services.data?.length ?? 0})</h3>
              <p className="text-xs text-slate-500">Available across all clinic branches and POS billing carts</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => services.refetch()}>
              ↻ Refresh
            </Button>
          </div>

          {services.isLoading ? (
            <p className="text-sm text-slate-500 py-8">Loading catalog items…</p>
          ) : (services.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No services cataloged yet. Add your first clinical service on the left.</p>
          ) : (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 uppercase text-xs text-slate-400 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5">Code</th>
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5">Price</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {services.data?.map((item: ServiceItem) => {
                    const isActive = item.status === "ACTIVE";
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-3 font-mono font-bold text-xs text-teal-800">{item.code}</td>
                        <td className="px-3 py-3 font-medium text-slate-900">{item.name}</td>
                        <td className="px-3 py-3 font-semibold text-slate-800">${item.defaultPrice}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              toggleStatusMutation.mutate({
                                id: item.id,
                                status: isActive ? "INACTIVE" : "ACTIVE",
                              })
                            }
                          >
                            {isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
