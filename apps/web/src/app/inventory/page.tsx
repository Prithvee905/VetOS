"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  listProducts,
  createProduct,
  listBatches,
  createBatch,
  adjustStock,
  listBatchMovements,
  listBranches,
  listVendors,
  createVendor,
  currentUser,
  type Product,
  type InventoryBatch,
  type StockMovement,
  type Vendor,
  type SessionUser,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Building2, Truck, TrendingUp, DollarSign, Layers, Pill, CheckCircle2, AlertTriangle, Search } from "lucide-react";

export default function InventoryPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"BATCHES" | "PRODUCTS">("BATCHES");
  const session = useQuery<SessionUser>({
    queryKey: ["session"],
    queryFn: currentUser,
  });
  const isOwner = session.data?.roles.some((r) => r.toUpperCase() === "OWNER") ?? false;
  const isDoctor = (session.data?.roles.some((r) => r.toUpperCase() === "DOCTOR") ?? false) && !isOwner;
  const canViewFinancials = isOwner;
  const [medicineSearch, setMedicineSearch] = useState("");
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [expiringFilter, setExpiringFilter] = useState(false);

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showQuickVendorModal, setShowQuickVendorModal] = useState(false);
  const [adjustBatch, setAdjustBatch] = useState<InventoryBatch | null>(null);
  const [viewMovementsBatch, setViewMovementsBatch] = useState<InventoryBatch | null>(null);

  // New Product Form
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("UNIT");
  const [newPrice, setNewPrice] = useState("0.00");
  const [newCostPrice, setNewCostPrice] = useState("0.00");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newDistributorId, setNewDistributorId] = useState("");

  // New Batch Form
  const [batchProductId, setBatchProductId] = useState("");
  const [batchBranchId, setBatchBranchId] = useState("");
  const [batchInitialQty, setBatchInitialQty] = useState("10");
  const [batchExpiry, setBatchExpiry] = useState("");
  const [batchCostPrice, setBatchCostPrice] = useState("0.00");
  const [batchVendorId, setBatchVendorId] = useState("");

  // Quick Vendor Form
  const [quickDistributorName, setQuickDistributorName] = useState("");
  const [quickCompanyName, setQuickCompanyName] = useState("");
  const [quickContactPerson, setQuickContactPerson] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickEmail, setQuickEmail] = useState("");
  const [quickAddress, setQuickAddress] = useState("");
  const [quickGstin, setQuickGstin] = useState("");
  const [quickDlNumber, setQuickDlNumber] = useState("");
  const [quickNotes, setQuickNotes] = useState("");

  // Adjustment Form
  const [adjustChange, setAdjustChange] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");

  // Queries
  const branchesQuery = useQuery({
    queryKey: ["branches"],
    queryFn: () => listBranches(),
  });

  const productsQuery = useQuery<Product[]>({
    queryKey: ["inventory-products"],
    queryFn: () => listProducts(),
  });

  const batchesQuery = useQuery<InventoryBatch[]>({
    queryKey: ["inventory-batches", lowStockFilter, expiringFilter],
    queryFn: () => listBatches({ lowStockOnly: lowStockFilter, expiringOnly: expiringFilter }),
  });

  const vendorsQuery = useQuery<Vendor[]>({
    queryKey: ["vendors"],
    queryFn: () => listVendors(),
  });

  const movementsQuery = useQuery<StockMovement[]>({
    queryKey: ["batch-movements", viewMovementsBatch?.id],
    queryFn: () => listBatchMovements(viewMovementsBatch!.id),
    enabled: !!viewMovementsBatch,
  });

  // KPI Valuations
  const totalCostValuation = useMemo(() => {
    return (batchesQuery.data || []).reduce((acc, b) => {
      const cost = Number(b.costPrice ?? b.salePrice ?? 0);
      return acc + b.quantityOnHand * cost;
    }, 0);
  }, [batchesQuery.data]);

  const totalRetailValuation = useMemo(() => {
    return (batchesQuery.data || []).reduce((acc, b) => {
      const retail = Number(b.salePrice ?? b.costPrice ?? 0);
      return acc + b.quantityOnHand * retail;
    }, 0);
  }, [batchesQuery.data]);

  const estimatedProfit = useMemo(() => {
    return Math.max(0, totalRetailValuation - totalCostValuation);
  }, [totalRetailValuation, totalCostValuation]);

  const estimatedMarginPercent = useMemo(() => {
    if (totalRetailValuation <= 0) return 0;
    return ((estimatedProfit / totalRetailValuation) * 100).toFixed(1);
  }, [totalRetailValuation, estimatedProfit]);

  const filteredBatches = useMemo(() => {
    return (batchesQuery.data || []).filter((b) => {
      if (!medicineSearch.trim()) return true;
      const q = medicineSearch.toLowerCase();
      const prod = (productsQuery.data || []).find((p) => p.id === b.productId);
      return (
        b.productName?.toLowerCase().includes(q) ||
        b.sku?.toLowerCase().includes(q) ||
        b.companyName?.toLowerCase().includes(q) ||
        prod?.name.toLowerCase().includes(q)
      );
    });
  }, [batchesQuery.data, productsQuery.data, medicineSearch]);

  const filteredProducts = useMemo(() => {
    return (productsQuery.data || []).filter((p) => {
      if (!medicineSearch.trim()) return true;
      const q = medicineSearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.companyName?.toLowerCase().includes(q)
      );
    });
  }, [productsQuery.data, medicineSearch]);

  // Mutations
  const createProductMutation = useMutation({
    mutationFn: () =>
      createProduct({
        sku: newSku,
        name: newName,
        unit: newUnit,
        salePrice: parseFloat(newPrice) || 0,
        purchasePrice: parseFloat(newCostPrice) || 0,
        companyName: newCompanyName || undefined,
        distributorId: newDistributorId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-products"] });
      setShowProductModal(false);
      setNewSku("");
      setNewName("");
      setNewPrice("0.00");
      setNewCostPrice("0.00");
      setNewCompanyName("");
      setNewDistributorId("");
    },
  });

  const createBatchMutation = useMutation({
    mutationFn: () =>
      createBatch({
        productId: batchProductId,
        branchId: batchBranchId,
        initialQuantity: parseFloat(batchInitialQty) || 0,
        expiresOn: batchExpiry || undefined,
        costPrice: parseFloat(batchCostPrice) || 0,
        vendorId: batchVendorId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      setShowBatchModal(false);
      setBatchProductId("");
      setBatchInitialQty("10");
      setBatchExpiry("");
      setBatchCostPrice("0.00");
      setBatchVendorId("");
    },
  });

  const createVendorMutation = useMutation({
    mutationFn: () =>
      createVendor({
        distributorName: quickDistributorName.trim(),
        companyName: quickCompanyName.trim() || undefined,
        contactPerson: quickContactPerson.trim() || undefined,
        phone: quickPhone.trim() || undefined,
        email: quickEmail.trim() || undefined,
        address: quickAddress.trim() || undefined,
        gstin: quickGstin.trim() || undefined,
        dlNumber: quickDlNumber.trim() || undefined,
        notes: quickNotes.trim() || undefined,
      }),
    onSuccess: (newVen) => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      setShowQuickVendorModal(false);
      setNewDistributorId(newVen.id);
      setBatchVendorId(newVen.id);
      setQuickDistributorName("");
      setQuickCompanyName("");
      setQuickContactPerson("");
      setQuickPhone("");
      setQuickEmail("");
      setQuickAddress("");
      setQuickGstin("");
      setQuickDlNumber("");
      setQuickNotes("");
    },
  });

  const adjustStockMutation = useMutation({
    mutationFn: () =>
      adjustStock({
        batchId: adjustBatch!.id,
        quantityChange: parseFloat(adjustChange),
        reason: adjustReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-batches"] });
      setAdjustBatch(null);
      setAdjustChange("0");
      setAdjustReason("");
    },
  });

  function handleSelectBatchProduct(pId: string) {
    setBatchProductId(pId);
    const prod = productsQuery.data?.find((p) => p.id === pId);
    if (prod) {
      if (prod.purchasePrice !== undefined) {
        setBatchCostPrice(String(prod.purchasePrice));
      }
      if (prod.distributorId) {
        setBatchVendorId(prod.distributorId);
      }
    }
  }

  const defaultBranchId = branchesQuery.data?.items?.[0]?.id || "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {!canViewFinancials ? "Clinic Medicines & Stock Availability" : "Inventory & Medicines Master"}
          </h2>
          <p className="text-xs text-slate-500">
            {!canViewFinancials
              ? "Browse medications available in clinic stock, check quantities on hand, selling MRP prices, and expiry dates."
              : "Track manufacturer companies, distributors, purchase costs, valuations, and stock margins"}
          </p>
        </div>
        {canViewFinancials ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowQuickVendorModal(true)}
              className="flex items-center gap-1.5"
            >
              <Truck className="h-3.5 w-3.5 text-teal-700" />
              + New Distributor
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowProductModal(true)}
            >
              + Add Product / Medicine
            </Button>
            <Button
              type="button"
              className="bg-teal-800 text-white hover:bg-teal-900"
              size="sm"
              onClick={() => {
                if (defaultBranchId && !batchBranchId) {
                  setBatchBranchId(defaultBranchId);
                }
                setShowBatchModal(true);
              }}
            >
              + New Stock Batch
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 border border-teal-200">
              <span className="h-2 w-2 rounded-full bg-teal-600 animate-pulse" />
              Live Clinic Pharmacy
            </span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      {!canViewFinancials ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Hospital Formulary</p>
              <p className="text-xl font-extrabold text-slate-900 mt-1">{productsQuery.data?.length ?? 0} Drugs</p>
              <span className="text-[10px] text-slate-500 font-medium">Registered in clinic formulary</span>
            </div>
            <div className="rounded-lg bg-teal-50 p-2.5 text-teal-700">
              <Pill className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">In Stock & Ready</p>
              <p className="text-xl font-extrabold text-emerald-700 mt-1">
                {(batchesQuery.data || []).filter((b) => b.quantityOnHand > 0).length} Batches
              </p>
              <span className="text-[10px] text-slate-500 font-medium">Available for immediate prescription</span>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Low Stock Alert</p>
              <p className="text-xl font-extrabold text-amber-700 mt-1">
                {(batchesQuery.data || []).filter((b) => b.quantityOnHand <= 5 && b.quantityOnHand > 0).length} Items
              </p>
              <span className="text-[10px] text-amber-700 font-medium">Running low (&le; 5 units left)</span>
            </div>
            <div className="rounded-lg bg-amber-50 p-2.5 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Depleted / Re-order</p>
              <p className="text-xl font-extrabold text-rose-700 mt-1">
                {(batchesQuery.data || []).filter((b) => b.quantityOnHand <= 0).length} Out of Stock
              </p>
              <span className="text-[10px] text-rose-700 font-medium">Needs re-order from pharmacy</span>
            </div>
            <div className="rounded-lg bg-rose-50 p-2.5 text-rose-700">
              <Layers className="h-5 w-5" />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Bought Value (Purchase Cost)</p>
              <p className="text-xl font-extrabold text-slate-900 mt-1">₹{totalCostValuation.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <span className="text-[10px] text-slate-500 font-medium">Total price paid to buy current stock</span>
            </div>
            <div className="rounded-lg bg-teal-50 p-2.5 text-teal-700">
              <DollarSign className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Selling Value (Retail MRP)</p>
              <p className="text-xl font-extrabold text-emerald-700 mt-1">₹{totalRetailValuation.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <span className="text-[10px] text-slate-500 font-medium">Estimated revenue when sold to clients</span>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Est. Gross Profit & Margin</p>
              <p className="text-xl font-extrabold text-indigo-700 mt-1">₹{estimatedProfit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <span className="text-[10px] text-indigo-700 font-bold">{estimatedMarginPercent}% gross margin over purchase price</span>
            </div>
            <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-700">
              <Building2 className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Catalog & Batches</p>
              <p className="text-xl font-extrabold text-slate-900 mt-1">{productsQuery.data?.length ?? 0} SKUs</p>
              <span className="text-[10px] text-slate-400">{batchesQuery.data?.length ?? 0} active batches</span>
            </div>
            <div className="rounded-lg bg-slate-100 p-2.5 text-slate-700">
              <Layers className="h-5 w-5" />
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("BATCHES")}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeTab === "BATCHES"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          {!canViewFinancials ? `Available Hospital Stock (${filteredBatches.length})` : `Stock Batches (${batchesQuery.data?.length ?? 0})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("PRODUCTS")}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeTab === "PRODUCTS"
              ? "border-teal-700 text-teal-800"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          {!canViewFinancials ? `Medication Formulary Directory (${filteredProducts.length})` : `Catalog / Product Directory (${productsQuery.data?.length ?? 0})`}
        </button>
      </div>

      {activeTab === "BATCHES" ? (
        <div className="space-y-4">
          {/* Search & Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                id="search-medicines-input"
                type="text"
                placeholder={!canViewFinancials ? "Search available medicines by name, brand, or SKU…" : "Search stock batches…"}
                value={medicineSearch}
                onChange={(e) => setMedicineSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 shadow-2xs focus:border-teal-600 focus:outline-none"
              />
              {medicineSearch && (
                <button
                  type="button"
                  onClick={() => setMedicineSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lowStockFilter}
                  onChange={(e) => setLowStockFilter(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                Show Low Stock Only (&le; 5 units)
              </label>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={expiringFilter}
                  onChange={(e) => setExpiringFilter(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                Show Expiring Soon (&le; 30 days)
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600">
                  {!canViewFinancials ? (
                    <tr>
                      <th className="p-3">Medicine Name</th>
                      <th className="p-3">SKU / Code</th>
                      <th className="p-3">Manufacturer / Brand</th>
                      <th className="p-3">Available Stock</th>
                      <th className="p-3">Dispense Price (MRP)</th>
                      <th className="p-3">Expiry Date</th>
                      <th className="p-3">Availability Status</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="p-3">Product Name</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Manufacturer</th>
                      <th className="p-3">Distributor</th>
                      <th className="p-3">Quantity</th>
                      <th className="p-3 bg-amber-50/70 text-amber-900 border-x border-amber-100">Buy Price (Bought at)</th>
                      <th className="p-3 bg-emerald-50/70 text-emerald-900 border-r border-emerald-100">Sell Price (MRP)</th>
                      <th className="p-3">Total Bought Cost</th>
                      <th className="p-3">Profit / Unit</th>
                      <th className="p-3">Expires On</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batchesQuery.isLoading ? (
                    <tr>
                      <td colSpan={!canViewFinancials ? 7 : 11} className="p-4 text-center text-slate-400">Loading medicines…</td>
                    </tr>
                  ) : filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={!canViewFinancials ? 7 : 11} className="p-6 text-center text-slate-400">
                        {medicineSearch
                          ? `No medicines matching "${medicineSearch}"`
                          : "No batches found matching filter criteria."}
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map((b) => {
                      const prod = (productsQuery.data || []).find((p) => p.id === b.productId);
                      const buyPrice = Number(b.costPrice ?? prod?.purchasePrice ?? 0);
                      const sellPrice = Number(b.salePrice ?? prod?.salePrice ?? 0);
                      const totalBoughtCost = b.quantityOnHand * buyPrice;
                      const profitPerUnit = sellPrice - buyPrice;
                      const marginPct = sellPrice > 0 ? ((profitPerUnit / sellPrice) * 100).toFixed(0) : "0";

                      if (!canViewFinancials) {
                        return (
                          <tr key={b.id} className="hover:bg-slate-50 transition">
                            <td className="p-3">
                              <p className="font-bold text-slate-900 text-sm">{b.productName}</p>
                              <span className="text-[10px] text-slate-500 font-medium">{prod?.unit || "Unit"}</span>
                            </td>
                            <td className="p-3 font-mono text-slate-500">{b.sku}</td>
                            <td className="p-3 text-slate-700 font-medium">{b.companyName || prod?.companyName || "—"}</td>
                            <td className="p-3">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold text-xs ${
                                  b.quantityOnHand <= 0
                                    ? "bg-rose-100 text-rose-800 border border-rose-200"
                                    : b.quantityOnHand <= 5
                                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                                    : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                }`}
                              >
                                <span className={`h-2 w-2 rounded-full ${b.quantityOnHand <= 0 ? "bg-rose-500" : b.quantityOnHand <= 5 ? "bg-amber-500" : "bg-emerald-500"}`} />
                                {b.quantityOnHand > 0 ? `${b.quantityOnHand} in stock` : "Out of stock"}
                              </span>
                            </td>
                            <td className="p-3 font-bold text-slate-900">
                              ₹{sellPrice.toFixed(2)}
                              <span className="block text-[10px] text-slate-400 font-normal">MRP per {prod?.unit || "unit"}</span>
                            </td>
                            <td className="p-3">
                              {b.expiresOn ? (
                                <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                                  {b.expiresOn}
                                </span>
                              ) : (
                                <span className="text-slate-400">No Expiry</span>
                              )}
                            </td>
                            <td className="p-3">
                              {b.quantityOnHand > 0 ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                                  ✓ Ready to Prescribe
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-md">
                                  ⚠️ Low / Out of Stock
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={b.id} className="hover:bg-slate-50">
                          <td className="p-3 font-bold text-slate-900">{b.productName}</td>
                          <td className="p-3 font-mono text-slate-500">{b.sku}</td>
                          <td className="p-3 text-slate-700">{b.companyName || "—"}</td>
                          <td className="p-3 text-teal-800 font-medium">{b.vendorName || "—"}</td>
                          <td className="p-3">
                            <span
                              className={`rounded px-2.5 py-0.5 font-bold ${
                                b.quantityOnHand <= 5 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {b.quantityOnHand}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-amber-900 bg-amber-50/40 border-x border-amber-100">
                            ₹{buyPrice.toFixed(2)}
                            <span className="block text-[10px] font-normal text-slate-400">bought / unit</span>
                          </td>
                          <td className="p-3 font-bold text-emerald-800 bg-emerald-50/40 border-r border-emerald-100">
                            ₹{sellPrice.toFixed(2)}
                            <span className="block text-[10px] font-normal text-slate-400">selling MRP</span>
                          </td>
                          <td className="p-3 font-bold text-slate-900">
                            ₹{totalBoughtCost.toFixed(2)}
                            <span className="block text-[10px] font-normal text-slate-400">{b.quantityOnHand} × ₹{buyPrice.toFixed(2)}</span>
                          </td>
                          <td className="p-3">
                            {sellPrice > 0 ? (
                              <span
                                className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                                  profitPerUnit >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {profitPerUnit >= 0 ? `+₹${profitPerUnit.toFixed(2)}` : `-₹${Math.abs(profitPerUnit).toFixed(2)}`}
                                <span className="ml-1 text-[10px] opacity-75">({marginPct}%)</span>
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            {b.expiresOn ? (
                              <span className="font-semibold text-slate-700">{b.expiresOn}</span>
                            ) : (
                              <span className="text-slate-400">No Expiry</span>
                            )}
                          </td>
                          <td className="p-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setAdjustBatch(b);
                                setAdjustChange("0");
                                setAdjustReason("Stock reconciliation");
                              }}
                              className="rounded bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                            >
                              Adjust Stock
                            </button>
                            <button
                              type="button"
                              onClick={() => setViewMovementsBatch(b)}
                              className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                            >
                              Audit Ledger
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Products Catalog Tab */
        <div className="space-y-4">
          {/* Search for Catalog */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search formulary catalog by drug name, brand, or SKU…"
              value={medicineSearch}
              onChange={(e) => setMedicineSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white pl-8 pr-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 shadow-2xs focus:border-teal-600 focus:outline-none"
            />
            {medicineSearch && (
              <button
                type="button"
                onClick={() => setMedicineSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600">
                  {!canViewFinancials ? (
                    <tr>
                      <th className="p-3">SKU / Code</th>
                      <th className="p-3">Medicine Name</th>
                      <th className="p-3">Manufacturer / Brand</th>
                      <th className="p-3">Unit / Form</th>
                      <th className="p-3">Patient Price (MRP)</th>
                      <th className="p-3">Formulary Status</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Product Name</th>
                      <th className="p-3">Manufacturer Company</th>
                      <th className="p-3">Distributor</th>
                      <th className="p-3">Unit</th>
                      <th className="p-3">Buy Price (Cost)</th>
                      <th className="p-3">Sell Price (MRP)</th>
                      <th className="p-3">Margin %</th>
                      <th className="p-3">Status</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productsQuery.isLoading ? (
                    <tr>
                      <td colSpan={!canViewFinancials ? 6 : 9} className="p-4 text-center text-slate-400">Loading catalog…</td>
                    </tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={!canViewFinancials ? 6 : 9} className="p-6 text-center text-slate-400">
                        {medicineSearch ? `No medications found matching "${medicineSearch}"` : "No products configured yet."}
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => {
                      const cost = Number(p.purchasePrice || 0);
                      const sale = Number(p.salePrice || 0);
                      const profit = sale - cost;
                      const margin = sale > 0 ? ((profit / sale) * 100).toFixed(1) : "0.0";

                      if (!canViewFinancials) {
                        return (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="p-3 font-mono font-bold text-slate-700">{p.sku}</td>
                            <td className="p-3 font-bold text-slate-900 text-sm">{p.name}</td>
                            <td className="p-3 text-slate-700 font-medium">{p.companyName || "—"}</td>
                            <td className="p-3 text-slate-600">{p.unit}</td>
                            <td className="p-3 font-bold text-slate-900">₹{sale.toFixed(2)}</td>
                            <td className="p-3">
                              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                {p.status}
                              </span>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono font-bold text-slate-700">{p.sku}</td>
                          <td className="p-3 font-semibold text-slate-900">{p.name}</td>
                          <td className="p-3 text-slate-700">{p.companyName || "—"}</td>
                          <td className="p-3 text-teal-800 font-medium">{p.distributorName || "—"}</td>
                          <td className="p-3 text-slate-600">{p.unit}</td>
                          <td className="p-3 font-semibold text-slate-700">₹{cost.toFixed(2)}</td>
                          <td className="p-3 font-bold text-teal-900">₹{sale.toFixed(2)}</td>
                          <td className="p-3">
                            <span className={`rounded px-1.5 py-0.5 font-bold text-[10px] ${profit >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                              {margin}% ({profit >= 0 ? `+₹${profit.toFixed(2)}` : `-₹${Math.abs(profit).toFixed(2)}`})
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Product */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Add Medicine / Product to Catalog</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">SKU / Code *</label>
                  <input
                    type="text"
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value.toUpperCase())}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-mono"
                    placeholder="e.g. AMOX-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Unit</label>
                  <input
                    type="text"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                    placeholder="TABLET / VIAL / ML / BOTTLE"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">Medicine / Product Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Amoxicillin 500mg or Ceftriaxone 1g"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Manufacturer / Company</label>
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                    placeholder="e.g. Cipla, Zoetis, Pfizer, Intas, Virbac"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">Distributor / Supplier</label>
                    <button
                      type="button"
                      onClick={() => setShowQuickVendorModal(true)}
                      className="text-[10px] text-teal-700 hover:underline font-bold"
                    >
                      + Add New
                    </button>
                  </div>
                  <select
                    value={newDistributorId}
                    onChange={(e) => setNewDistributorId(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  >
                    <option value="">Select distributor…</option>
                    {(vendorsQuery.data || []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.distributorName || v.name} {v.companyName ? `(${v.companyName})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Purchase / Buy Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newCostPrice}
                    onChange={(e) => setNewCostPrice(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-semibold text-slate-800"
                    placeholder="80.00"
                  />
                  <span className="text-[10px] text-slate-400">Price paid to distributor</span>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Selling Price / MRP (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-bold text-teal-800"
                    placeholder="120.00"
                  />
                  <span className="text-[10px] text-slate-400">Counter retail price</span>
                </div>
              </div>

              {/* Profit & Margin Calculator Banner */}
              {parseFloat(newPrice) > 0 && (
                <div className="rounded-lg bg-teal-50 border border-teal-200 p-2.5 text-xs text-teal-900 flex justify-between items-center">
                  <span>Gross Profit: <strong>₹{(parseFloat(newPrice) - (parseFloat(newCostPrice) || 0)).toFixed(2)}</strong></span>
                  <span>Margin: <strong>{(((parseFloat(newPrice) - (parseFloat(newCostPrice) || 0)) / parseFloat(newPrice)) * 100).toFixed(1)}%</strong></span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowProductModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white"
                disabled={!newSku || !newName || createProductMutation.isPending}
                onClick={() => createProductMutation.mutate()}
              >
                {createProductMutation.isPending ? "Saving…" : "Save Product"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Batch */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Add Stock Batch</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Product / Medicine *</label>
                <select
                  value={batchProductId}
                  onChange={(e) => handleSelectBatchProduct(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-medium"
                >
                  <option value="">Select product…</option>
                  {(productsQuery.data || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku}) {p.companyName ? `• ${p.companyName}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Distributor / Supplier</label>
                  <select
                    value={batchVendorId}
                    onChange={(e) => setBatchVendorId(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  >
                    <option value="">Select distributor…</option>
                    {(vendorsQuery.data || []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.distributorName || v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Branch *</label>
                  <select
                    value={batchBranchId || defaultBranchId}
                    onChange={(e) => setBatchBranchId(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  >
                    {(branchesQuery.data?.items || []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Initial Quantity *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={batchInitialQty}
                    onChange={(e) => setBatchInitialQty(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Buy Price / Unit (Price You Bought At ₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={batchCostPrice}
                    onChange={(e) => setBatchCostPrice(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-semibold text-amber-900 bg-amber-50/20"
                  />
                  <span className="text-[10px] text-slate-400">Price you paid to distributor / unit</span>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">Expiry Date</label>
                  <input
                    type="date"
                    value={batchExpiry}
                    onChange={(e) => setBatchExpiry(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  />
                </div>
              </div>

              {parseFloat(batchInitialQty) > 0 && parseFloat(batchCostPrice) > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-950 flex justify-between">
                  <span>Total Purchase Cost (Bought Value):</span>
                  <span className="font-bold text-amber-950">₹{(parseFloat(batchInitialQty) * parseFloat(batchCostPrice)).toFixed(2)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowBatchModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white"
                disabled={!batchProductId || createBatchMutation.isPending}
                onClick={() => createBatchMutation.mutate()}
              >
                {createBatchMutation.isPending ? "Adding…" : "Add Batch"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Quick Add Distributor */}
      {showQuickVendorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Add Medicine Distributor & Supplier</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Record complete supplier credentials including sales representative details, ordering emails, address, and license information.
              </p>
            </div>

            <div className="space-y-4">
              {/* Business Identity */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>Distributor / Agency Name *</span>
                    <span className="text-[11px] text-teal-700 font-normal">Who invoices & delivers</span>
                  </label>
                  <input
                    type="text"
                    value={quickDistributorName}
                    onChange={(e) => setQuickDistributorName(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm font-semibold focus:border-teal-600 focus:outline-none"
                    placeholder="e.g. Apex Pharma Distributors or City Vet Supplies"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>Associated Company / Manufacturer</span>
                    <span className="text-[11px] text-indigo-700 font-normal">Brand or maker</span>
                  </label>
                  <input
                    type="text"
                    value={quickCompanyName}
                    onChange={(e) => setQuickCompanyName(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm focus:border-teal-600 focus:outline-none"
                    placeholder="e.g. Authorized Cipla / Zoetis / Virbac distributor"
                  />
                </div>
              </div>

              {/* The Person Who Sold to Us & Contact Details */}
              <div className="rounded-lg bg-teal-50/50 border border-teal-100 p-3.5 space-y-3">
                <p className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                  <span>👤</span>
                  <span>Sales Representative & Communication Channels</span>
                </p>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Person Who Sold To Us / Representative Name</label>
                  <input
                    type="text"
                    value={quickContactPerson}
                    onChange={(e) => setQuickContactPerson(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm bg-white focus:border-teal-600 focus:outline-none"
                    placeholder="e.g. Ramesh Kumar (Area Sales Manager)"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Contact Phone / Mobile</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={quickPhone}
                      onChange={(e) => setQuickPhone(e.target.value.replace(/[^0-9+]/g, "").slice(0, 15))}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-sm bg-white focus:border-teal-600 focus:outline-none"
                      placeholder="e.g. 9876543210"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Email Address (Mails)</label>
                    <input
                      type="email"
                      value={quickEmail}
                      onChange={(e) => setQuickEmail(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-sm bg-white focus:border-teal-600 focus:outline-none"
                      placeholder="orders@distributor.com"
                    />
                  </div>
                </div>
              </div>

              {/* Address & Legal / Tax Information */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">Physical Address / City / Depot</label>
                  <input
                    type="text"
                    value={quickAddress}
                    onChange={(e) => setQuickAddress(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm focus:border-teal-600 focus:outline-none"
                    placeholder="e.g. Plot 42, Wholesale Pharma Complex, Banjara Hills, Hyderabad"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700">GSTIN (Tax ID)</label>
                    <input
                      type="text"
                      value={quickGstin}
                      onChange={(e) => setQuickGstin(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-sm uppercase focus:border-teal-600 focus:outline-none"
                      placeholder="e.g. 36AABCP1234F1Z5"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700">Drug License No. (DL)</label>
                    <input
                      type="text"
                      value={quickDlNumber}
                      onChange={(e) => setQuickDlNumber(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-sm focus:border-teal-600 focus:outline-none"
                      placeholder="e.g. 20B/21B-TS/HYD/45678"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Payment Terms & Notes</label>
                  <textarea
                    rows={2}
                    value={quickNotes}
                    onChange={(e) => setQuickNotes(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-sm focus:border-teal-600 focus:outline-none"
                    placeholder="e.g. Net 15 days credit, orders on Mondays, next-day free delivery, bank transfer details"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setShowQuickVendorModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white hover:bg-teal-900"
                disabled={!quickDistributorName.trim() || createVendorMutation.isPending}
                onClick={() => createVendorMutation.mutate()}
              >
                {createVendorMutation.isPending ? "Saving…" : "Save Distributor & Supplier"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Adjust Stock */}
      {adjustBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Adjust Stock for {adjustBatch.productName}</h3>
            <p className="text-xs text-slate-500">Current on-hand: {adjustBatch.quantityOnHand}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">Quantity Change (+ or -) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={adjustChange}
                  onChange={(e) => setAdjustChange(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. 5 to add, -2 to deduct"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Reason / Reference *</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                  placeholder="e.g. Expired stock write-off or physical count check"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAdjustBatch(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-teal-800 text-white"
                disabled={!adjustReason || adjustStockMutation.isPending}
                onClick={() => adjustStockMutation.mutate()}
              >
                {adjustStockMutation.isPending ? "Recording…" : "Save Adjustment"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Movements / Audit Ledger */}
      {viewMovementsBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Movement Audit Ledger</h3>
                <p className="text-xs text-slate-500">{viewMovementsBatch.productName} (SKU: {viewMovementsBatch.sku})</p>
              </div>
              <button
                type="button"
                onClick={() => setViewMovementsBatch(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
              {movementsQuery.isLoading ? (
                <p className="p-4 text-center text-slate-400">Loading ledger…</p>
              ) : (movementsQuery.data || []).length === 0 ? (
                <p className="p-4 text-center text-slate-400">No stock movements recorded for this batch.</p>
              ) : (
                (movementsQuery.data || []).map((m) => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 uppercase">{m.movementType}</span>
                      <p className="text-slate-500">{m.reference || "No reference"}</p>
                      <span className="text-[10px] text-slate-400">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <div>
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-xs ${
                          m.quantity > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setViewMovementsBatch(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
