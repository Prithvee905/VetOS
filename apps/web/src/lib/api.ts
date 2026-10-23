function apiUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
}

export type SessionUser = {
  id: string;
  clinicId: string;
  displayName: string;
  roles: string[];
  /** The clinic requires two-step login and this user must set it up first. */
  twoStepSetupRequired?: boolean;
};

/** Password was right; a code from the authenticator app is needed to finish signing in. */
export type TwoStepChallenge = {
  twoStepRequired: true;
  challengeToken: string;
};

export type ClinicProfile = {
  id: string;
  name: string;
  legalName: string | null;
  timezone: string;
  currencyCode: string;
  defaultTaxRate: string;
  phone: string | null;
  email: string | null;
  status: string;
  maxStaffDiscountPercent?: number;
  loyalDiscountPercent?: number;
  ngoConsultationDiscountPercent?: number;
  allowMedicineDiscount?: boolean;
  address?: string | null;
  gstin?: string | null;
  /** Owners and doctors must use an authenticator app to sign in. */
  requireTwoStep?: boolean;
  /** True when catalog prices already include GST (MRP style). */
  pricesIncludeTax?: boolean;
  version: number;
};

export type UserRow = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  branchId: string | null;
  roles: string[];
  version: number;
};

export type ApiError = {
  code: string;
  message: string;
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const API_FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Cannot reach the server (timed out). Check your connection and try again.");
    }
    throw new Error("Cannot reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function ensureCsrf(): Promise<void> {
  await fetchWithTimeout(`${apiUrl()}/api/v1/auth/csrf`, { credentials: "include" });
}

export async function checkApiLiveness(): Promise<{ status: string }> {
  const response = await fetchWithTimeout("/actuator/health/liveness", { credentials: "include" });
  if (!response.ok) {
    throw new Error("API is not ready");
  }
  return response.json() as Promise<{ status: string }>;
}

export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    await ensureCsrf();
  }
  const headers = new Headers(init.headers);
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }
  const csrf = readCookie("XSRF-TOKEN");
  if (csrf && method !== "GET" && method !== "HEAD") {
    headers.set("X-XSRF-TOKEN", csrf);
  }
  let response = await fetchWithTimeout(`${apiUrl()}${path}`, { ...init, headers, credentials: "include" });
  if (response.status === 401 && !path.startsWith("/api/v1/auth/login") && path !== "/api/v1/auth/refresh") {
    try {
      await ensureCsrf();
      const refreshHeaders = new Headers();
      const freshCsrf = readCookie("XSRF-TOKEN");
      if (freshCsrf) {
        refreshHeaders.set("X-XSRF-TOKEN", freshCsrf);
      }
      const refreshRes = await fetchWithTimeout(`${apiUrl()}/api/v1/auth/refresh`, {
        method: "POST",
        headers: refreshHeaders,
        credentials: "include",
      });
      if (refreshRes.ok) {
        const retryCsrf = readCookie("XSRF-TOKEN");
        if (retryCsrf && method !== "GET" && method !== "HEAD") {
          headers.set("X-XSRF-TOKEN", retryCsrf);
        }
        response = await fetchWithTimeout(`${apiUrl()}${path}`, { ...init, headers, credentials: "include" });
      }
    } catch {
      // Refresh failed, proceed to error handling
    }
  }
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(error?.message ?? `Request failed (${response.status})`);
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export async function login(email: string, password: string): Promise<SessionUser | TwoStepChallenge> {
  await ensureCsrf();
  return apiJson<SessionUser | TwoStepChallenge>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function loginTwoStep(challengeToken: string, code: string): Promise<SessionUser> {
  return apiJson<SessionUser>("/api/v1/auth/login/two-step", {
    method: "POST",
    body: JSON.stringify({ challengeToken, code }),
  });
}

export type TwoStepStatus = { enabled: boolean; required: boolean; recoveryCodesLeft: number };
export type TwoStepSetup = { secret: string; otpauthUri: string; qrSvg: string };

export async function getTwoStepStatus(): Promise<TwoStepStatus> {
  return apiJson<TwoStepStatus>("/api/v1/auth/two-step");
}

export async function beginTwoStepSetup(): Promise<TwoStepSetup> {
  return apiJson<TwoStepSetup>("/api/v1/auth/two-step/setup", { method: "POST" });
}

export async function enableTwoStep(code: string): Promise<{ recoveryCodes: string[] }> {
  return apiJson<{ recoveryCodes: string[] }>("/api/v1/auth/two-step/enable", { method: "POST", body: JSON.stringify({ code }) });
}

export async function renewRecoveryCodes(code: string): Promise<{ recoveryCodes: string[] }> {
  return apiJson<{ recoveryCodes: string[] }>("/api/v1/auth/two-step/recovery-codes", { method: "POST", body: JSON.stringify({ code }) });
}

export async function disableTwoStep(password: string, code: string): Promise<void> {
  await apiJson<void>("/api/v1/auth/two-step/disable", { method: "POST", body: JSON.stringify({ password, code }) });
}

export async function resetUserTwoStep(userId: string): Promise<void> {
  await apiJson<void>(`/api/v1/users/${userId}/two-step/reset`, { method: "POST" });
}

/** Gets a fresh session cookie (e.g. right after turning on two-step login). */
export async function refreshSession(): Promise<SessionUser> {
  await ensureCsrf();
  return apiJson<SessionUser>("/api/v1/auth/refresh", { method: "POST" });
}

export async function currentUser(): Promise<SessionUser> {
  return apiJson<SessionUser>("/api/v1/auth/me");
}

export async function logout(): Promise<void> {
  await apiJson<void>("/api/v1/auth/logout", { method: "POST" });
}

export type Branch = { id: string; name: string; status: string };

export type ClientCategory = "STANDARD" | "LOYAL" | "NGO";

export type ClientRow = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  status: string;
  category?: ClientCategory;
};

export type PatientRow = {
  id: string;
  clientId: string;
  name: string;
  speciesCode: string;
  sizeCategory: string;
  breed?: string | null;
  dateOfBirth?: string | null;
  sexCode?: string | null;
  color?: string | null;
  microchip?: string | null;
  notes?: string | null;
  version?: number;
};

export type UserRowBrief = UserRow;

export type AppointmentRow = {
  id: string;
  branchId: string;
  patientId: string;
  doctorUserId: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

export type PrescriptionItemRow = {
  id: string;
  medicineName: string;
  quantity: string;
  dosage: string;
  frequency: string;
  duration: string;
};

export type PrescriptionRow = {
  id: string;
  consultationId: string;
  items: PrescriptionItemRow[];
};

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  total: string;
  amountPaid: string;
  status: string;
  subtotal?: number | string;
  taxTotal?: number | string;
  lines: {
    id: string;
    description: string;
    lineTotal: string;
    quantity?: number | string;
    unitPrice?: number | string;
    taxRate?: number | string;
    hsnSac?: string | null;
  }[];
};

export type BranchPage = {
  items: Branch[];
  page: number;
  size: number;
  hasNext: boolean;
};

export async function listBranches(page = 0, size = 50): Promise<BranchPage> {
  return apiJson<BranchPage>(`/api/v1/branches?page=${page}&size=${size}`);
}

export async function listClients(): Promise<ClientRow[]> {
  return apiJson<ClientRow[]>("/api/v1/clients");
}

export async function createClient(body: {
  displayName: string;
  phone?: string;
  email?: string;
  consentWhatsapp?: boolean;
  consentEmail?: boolean;
  category?: ClientCategory;
}): Promise<ClientRow> {
  const payload = {
    consentWhatsapp: body.consentWhatsapp ?? false,
    consentEmail: body.consentEmail ?? false,
    category: body.category ?? "STANDARD",
    ...body,
  };
  return apiJson<ClientRow>("/api/v1/clients", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateClientCategory(clientId: string, category: ClientCategory): Promise<ClientRow> {
  return apiJson<ClientRow>(`/api/v1/clients/${clientId}/category`, {
    method: "PATCH",
    body: JSON.stringify({ category }),
  });
}

export async function listPatients(clientId?: string): Promise<PatientRow[]> {
  const query = clientId ? `?clientId=${clientId}` : "";
  return apiJson<PatientRow[]>(`/api/v1/patients${query}`);
}

export async function createPatient(body: Record<string, unknown>): Promise<PatientRow> {
  return apiJson<PatientRow>("/api/v1/patients", { method: "POST", body: JSON.stringify(body) });
}

export async function listUsers(): Promise<{ items: UserRowBrief[] }> {
  try {
    return await apiJson<{ items: UserRowBrief[] }>("/api/v1/users/practitioners");
  } catch {
    return await apiJson<{ items: UserRowBrief[] }>("/api/v1/users");
  }
}

export async function createAppointment(body: Record<string, unknown>): Promise<AppointmentRow> {
  return apiJson<AppointmentRow>("/api/v1/appointments", { method: "POST", body: JSON.stringify(body) });
}

export async function checkInQueue(appointmentId: string): Promise<{ tokenNumber: number }> {
  return apiJson("/api/v1/queue", { method: "POST", body: JSON.stringify({ appointmentId }) });
}

export async function createConsultation(body: Record<string, unknown>): Promise<{ id: string }> {
  return apiJson("/api/v1/consultations", { method: "POST", body: JSON.stringify(body) });
}

export async function createPrescription(body: Record<string, unknown>): Promise<PrescriptionRow> {
  return apiJson<PrescriptionRow>("/api/v1/prescriptions", { method: "POST", body: JSON.stringify(body) });
}

export async function issueInvoice(body: Record<string, unknown>): Promise<InvoiceRow> {
  return apiJson<InvoiceRow>("/api/v1/invoices", { method: "POST", body: JSON.stringify(body) });
}

export type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  status: string;
  currencyCode: string;
  subtotal: number | string;
  discountTotal: number | string;
  taxTotal: number | string;
  total: number | string;
  amountPaid: number | string;
  issuedAt: string;
  lines: {
    id: string;
    description: string;
    quantity: number | string;
    unitPrice: number | string;
    taxRate?: number | string;
    taxAmount?: number | string;
    lineTotal: number | string;
    hsnSac?: string | null;
  }[];
};

export async function getInvoice(invoiceId: string): Promise<InvoiceDetail> {
  return apiJson<InvoiceDetail>(`/api/v1/invoices/${invoiceId}`);
}

// ----------------------------------------------------
// WhatsApp inbox (messages clients send to the clinic)
// ----------------------------------------------------
export type InboxMessage = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  fromPhone: string;
  messageType: string;
  body: string | null;
  receivedAt: string;
  readAt: string | null;
  handledAction: string | null;
};

export async function listWhatsAppInbox(limit = 100): Promise<InboxMessage[]> {
  return apiJson<InboxMessage[]>(`/api/v1/communications/whatsapp/inbox?limit=${limit}`);
}

export async function markInboxMessageRead(messageId: string): Promise<void> {
  await apiJson<void>(`/api/v1/communications/whatsapp/inbox/${messageId}/read`, { method: "POST" });
}

// ----------------------------------------------------
// Server-side billing basket (one open basket per patient)
// ----------------------------------------------------
export type ServerBasket<L> = {
  patientId: string;
  clientId: string | null;
  lines: L[];
  invoiceId: string | null;
  updatedAt: string | null;
};

export type BasketSummary = {
  patientId: string;
  clientId: string | null;
  patientName: string;
  clientName: string | null;
  lineCount: number;
  invoiceId: string | null;
  updatedAt: string;
};

export async function getBasket<L>(patientId: string): Promise<ServerBasket<L>> {
  return apiJson<ServerBasket<L>>(`/api/v1/baskets/${patientId}`);
}

export async function saveBasket<L>(
  patientId: string,
  body: { clientId?: string | null; lines: L[]; invoiceId?: string | null }
): Promise<ServerBasket<L>> {
  return apiJson<ServerBasket<L>>(`/api/v1/baskets/${patientId}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function clearBasket(patientId: string): Promise<void> {
  await apiJson<void>(`/api/v1/baskets/${patientId}`, { method: "DELETE" });
}

export async function listOpenBaskets(): Promise<BasketSummary[]> {
  return apiJson<BasketSummary[]>("/api/v1/baskets");
}

/** Adds lines to a patient's server basket, keeping whatever is already there. */
export async function appendToBasket<L>(patientId: string, clientId: string | null | undefined, lines: L[]): Promise<ServerBasket<L>> {
  const current = await getBasket<L>(patientId);
  return saveBasket<L>(patientId, {
    clientId: clientId ?? current.clientId,
    lines: [...current.lines, ...lines],
    invoiceId: current.invoiceId,
  });
}

// ----------------------------------------------------
// Patient health profile (server-side)
// ----------------------------------------------------
export type HealthProfileResponse<T> = {
  patientId: string;
  profile: T | null;
  updatedAt: string | null;
};

export async function getHealthProfile<T>(patientId: string): Promise<HealthProfileResponse<T>> {
  return apiJson<HealthProfileResponse<T>>(`/api/v1/patients/${patientId}/health-profile`);
}

export async function saveHealthProfile<T>(patientId: string, profile: T): Promise<HealthProfileResponse<T>> {
  return apiJson<HealthProfileResponse<T>>(`/api/v1/patients/${patientId}/health-profile`, {
    method: "PUT",
    body: JSON.stringify({ profile }),
  });
}

export type PrescriptionDetail = {
  id: string;
  consultationId: string;
  patientId: string;
  doctorUserId: string;
  status: string;
  notes: string | null;
  items: {
    id: string;
    medicineName: string;
    quantity: number | string;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    route: string | null;
    instructions: string | null;
  }[];
};

export async function getPrescription(prescriptionId: string): Promise<PrescriptionDetail> {
  return apiJson<PrescriptionDetail>(`/api/v1/prescriptions/${prescriptionId}`);
}

export async function downloadInvoicePdf(invoiceId: string, invoiceNumber: string): Promise<void> {
  await ensureCsrf();
  const response = await fetchWithTimeout(`${apiUrl()}/api/v1/invoices/${invoiceId}/pdf`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(err?.message ?? "Could not download invoice PDF.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `invoice-${invoiceNumber.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function recordPayment(invoiceId: string, amount: string, idempotencyKey: string, method: string = "UPI"): Promise<void> {
  await apiJson("/api/v1/payments", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ invoiceId, method, amount }),
  });
}

// ----------------------------------------------------
// Dashboard & Omni-Search
// ----------------------------------------------------
export type DueAlert = {
  id: string;
  patientId: string;
  patientName: string;
  alertType: string;
  itemName: string;
  nextDueOn: string;
};

export type LiveQueueItem = {
  id: string;
  tokenNumber: number;
  priority: "NORMAL" | "EMERGENCY" | string;
  status: "WAITING" | "IN_CONSULTATION" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | string;
  checkInTime: string;
  patientId: string;
  patientName: string;
  clientName: string;
  doctorName: string;
};

export type TodayAppointmentItem = {
  id: string;
  patientName: string;
  appointmentType: string;
  doctorName: string;
  time: string;
  status: string;
};

export type InventoryBatchItem = {
  productName: string;
  batchCount: number;
  expiryDate: string;
  quantityOnHand: number;
  isLow: boolean;
};

export type DashboardOverview = {
  todayAppointmentsCount: number;
  activeQueueCount: number;
  todayRevenue: number;
  activePatientsCount: number;
  lowStockCount: number;
  hospitalizedCount: number;
  vaccinationsDue: DueAlert[];
  dewormingsDue: DueAlert[];
  petOwnersCount: number;
  registeredPetsCount: number;
  scheduledAppointmentsCount: number;
  checkedInAppointmentsCount: number;
  outstandingDues: number;
  liveQueue: LiveQueueItem[];
  todayAppointments: TodayAppointmentItem[];
  inventoryBatches: InventoryBatchItem[];
  messagesSentCount: number;
  totalQueueToday: number;
  emergencyQueueToday: number;
  pendingInvoicesCount: number;
};

export async function getClinicProfile(): Promise<ClinicProfile> {
  return apiJson<ClinicProfile>("/api/v1/clinic");
}

export type SearchPatient = {
  id: string;
  name: string;
  species: string;
  breed: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
};

export type SearchClient = {
  id: string;
  displayName: string;
  phone: string;
  email: string;
};

export type SearchProduct = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  salePrice: number;
};

export type SearchResults = {
  patients: SearchPatient[];
  clients: SearchClient[];
  products: SearchProduct[];
};

export async function getDashboardOverview(): Promise<DashboardOverview> {
  return apiJson<DashboardOverview>("/api/v1/dashboard/overview");
}

export async function searchGlobal(q: string): Promise<SearchResults> {
  return apiJson<SearchResults>(`/api/v1/search?q=${encodeURIComponent(q)}`);
}

// ----------------------------------------------------
// Patient Timeline & Details
// ----------------------------------------------------
export type TimelineEvent = {
  id: string;
  eventType: string;
  title: string;
  subtitle: string;
  status: string;
  timestamp: string;
};

export type PatientTimeline = {
  patient: PatientRow;
  client: ClientRow;
  events: TimelineEvent[];
};

export async function getPatient(patientId: string): Promise<PatientRow> {
  return apiJson<PatientRow>(`/api/v1/patients/${patientId}`);
}

export async function getPatientTimeline(patientId: string): Promise<PatientTimeline> {
  return apiJson<PatientTimeline>(`/api/v1/patients/${patientId}/timeline`);
}

// ----------------------------------------------------
// Inventory & Pharmacy
// ----------------------------------------------------
export type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  salePrice: number;
  status: string;
  companyName?: string | null;
  distributorId?: string | null;
  distributorName?: string | null;
  purchasePrice?: number;
  hsnCode?: string | null;
  /** GST percentage, e.g. 12 for 12%. */
  gstRate?: number;
};

export type InventoryBatch = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  branchId: string;
  quantityOnHand: number;
  expiresOn: string | null;
  costPrice?: number;
  vendorId?: string | null;
  vendorName?: string | null;
  salePrice?: number;
  companyName?: string | null;
};

export type StockMovement = {
  id: string;
  batchId: string;
  productName?: string;
  movementType: string;
  quantity: number;
  reference: string;
  createdAt: string;
};

export type PrescriptionSummary = {
  id: string;
  consultationId: string;
  patientId: string;
  patientName: string;
  speciesCode: string;
  breed: string;
  clientName: string;
  clientPhone: string;
  doctorName: string;
  status: string;
  notes: string;
  medicines: string;
  createdAt: string;
};

export async function listPrescriptions(status?: string): Promise<PrescriptionSummary[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiJson<PrescriptionSummary[]>(`/api/v1/prescriptions${q}`);
}

export async function listProducts(query?: string): Promise<Product[]> {
  const q = query ? `?query=${encodeURIComponent(query)}` : "";
  return apiJson<Product[]>(`/api/v1/products${q}`);
}

export async function createProduct(body: {
  sku: string;
  name: string;
  unit?: string;
  salePrice: number;
  companyName?: string;
  distributorId?: string;
  purchasePrice?: number;
  hsnCode?: string;
  gstRate?: number;
}): Promise<Product> {
  return apiJson<Product>("/api/v1/products/item", { method: "POST", body: JSON.stringify(body) });
}

export async function updateProductTax(productId: string, body: { hsnCode?: string; gstRate: number }): Promise<void> {
  await apiJson<void>(`/api/v1/products/${productId}/tax`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function listBatches(params?: { branchId?: string; productId?: string; lowStockOnly?: boolean; expiringOnly?: boolean }): Promise<InventoryBatch[]> {
  const sp = new URLSearchParams();
  if (params?.branchId) sp.set("branchId", params.branchId);
  if (params?.productId) sp.set("productId", params.productId);
  if (params?.lowStockOnly) sp.set("lowStockOnly", "true");
  if (params?.expiringOnly) sp.set("expiringOnly", "true");
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return apiJson<InventoryBatch[]>(`/api/v1/inventory/batches${qs}`);
}

export async function createBatch(body: {
  productId: string;
  branchId: string;
  initialQuantity: number;
  expiresOn?: string;
  costPrice?: number;
  vendorId?: string;
}): Promise<InventoryBatch> {
  return apiJson<InventoryBatch>("/api/v1/inventory/batches", { method: "POST", body: JSON.stringify(body) });
}

export async function adjustStock(body: { batchId: string; quantityChange: number; reason: string }): Promise<{ batchId: string; updatedQuantityOnHand: number }> {
  return apiJson("/api/v1/inventory/adjustments", { method: "POST", body: JSON.stringify(body) });
}

export async function listBatchMovements(batchId: string): Promise<StockMovement[]> {
  return apiJson<StockMovement[]>(`/api/v1/inventory/batches/${batchId}/movements`);
}

export async function listAllMovements(limit = 50, batchId?: string): Promise<StockMovement[]> {
  const sp = new URLSearchParams();
  if (limit) sp.set("limit", String(limit));
  if (batchId) sp.set("batchId", batchId);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return apiJson<StockMovement[]>(`/api/v1/inventory/movements${qs}`);
}

export async function dispensePrescription(body: {
  prescriptionId: string;
  items?: { batchId: string; quantity: number }[];
}): Promise<{ prescriptionId: string; status: string }> {
  return apiJson("/api/v1/pharmacy/dispense", { method: "POST", body: JSON.stringify(body) });
}

export async function dispenseOtc(body: {
  items: { batchId: string; quantity: number }[];
  notes?: string;
}): Promise<void> {
  await apiJson("/api/v1/pharmacy/dispense-otc", { method: "POST", body: JSON.stringify(body) });
}

// ----------------------------------------------------
// Procurement & Vendors
// ----------------------------------------------------
export type Vendor = {
  id: string;
  name: string;
  distributorName?: string | null;
  companyName?: string | null;
  contactPerson?: string | null;
  phone: string | null;
  email: string | null;
  address?: string | null;
  gstin?: string | null;
  dlNumber?: string | null;
  notes?: string | null;
  status: string;
};

export type PurchaseOrder = {
  id: string;
  vendorId: string;
  vendorName: string;
  status: string;
  orderedAt: string;
  totalAmount: number;
};

export type PurchaseOrderDetail = {
  header: PurchaseOrder;
  lines: {
    id: string;
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    unitCost: number;
    lineTotal: number;
  }[];
};

export async function listVendors(): Promise<Vendor[]> {
  return apiJson<Vendor[]>("/api/v1/vendors");
}

export async function createVendor(body: {
  name?: string;
  distributorName: string;
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  gstin?: string;
  dlNumber?: string;
  notes?: string;
}): Promise<Vendor> {
  return apiJson<Vendor>("/api/v1/vendors", { method: "POST", body: JSON.stringify(body) });
}

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  return apiJson<PurchaseOrder[]>("/api/v1/purchases");
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderDetail> {
  return apiJson<PurchaseOrderDetail>(`/api/v1/purchases/${id}`);
}

export async function createPurchaseOrder(body: { vendorId: string; lines: { productId: string; quantity: number; unitCost: number }[] }): Promise<PurchaseOrderDetail> {
  return apiJson<PurchaseOrderDetail>("/api/v1/purchases", { method: "POST", body: JSON.stringify(body) });
}

export async function receiveGoods(id: string, body: { branchId: string; defaultExpiryDate?: string }): Promise<{ receiptId: string; status: string }> {
  return apiJson(`/api/v1/purchases/${id}/receive`, { method: "POST", body: JSON.stringify(body) });
}

// ----------------------------------------------------
// Clinical Specialties
// ----------------------------------------------------
export type DewormingRecord = {
  id: string;
  patientId: string;
  patientName: string;
  productName: string;
  administeredOn: string;
  nextDueOn: string | null;
  notes: string | null;
  createdAt: string;
};

export type LabOrder = {
  id: string;
  patientId: string;
  patientName: string;
  testName: string;
  status: string;
  chargeAmount: number;
  orderedAt: string;
};

export type SurgeryRecord = {
  id: string;
  patientId: string;
  patientName: string;
  procedureName: string;
  scheduledAt: string;
  status: string;
  chargeAmount: number;
};

export type AdmissionRecord = {
  id: string;
  patientId: string;
  patientName: string;
  admittedAt: string;
  dischargedAt: string | null;
  status: string;
  dailyRate: number;
  totalCharge: number;
};

export type GroomingRecord = {
  id: string;
  patientId: string;
  patientName: string;
  scheduledAt: string;
  status: string;
  dogSize: string;
  chargeAmount: number;
  notes: string | null;
};

export async function listDewormings(patientId?: string): Promise<DewormingRecord[]> {
  const q = patientId ? `?patientId=${patientId}` : "";
  return apiJson<DewormingRecord[]>(`/api/v1/dewormings${q}`);
}

export async function recordDeworming(body: { patientId: string; productName: string; administeredOn: string; nextDueOn?: string; notes?: string }): Promise<DewormingRecord> {
  return apiJson<DewormingRecord>("/api/v1/dewormings", { method: "POST", body: JSON.stringify(body) });
}

export async function listLabOrders(patientId?: string): Promise<LabOrder[]> {
  const q = patientId ? `?patientId=${patientId}` : "";
  return apiJson<LabOrder[]>(`/api/v1/labs${q}`);
}

export async function createLabOrder(body: { patientId: string; testName: string; chargeAmount?: number }): Promise<LabOrder> {
  return apiJson<LabOrder>("/api/v1/labs", { method: "POST", body: JSON.stringify(body) });
}

export async function updateLabStatus(id: string, status: string): Promise<void> {
  await apiJson(`/api/v1/labs/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function listSurgeries(patientId?: string): Promise<SurgeryRecord[]> {
  const q = patientId ? `?patientId=${patientId}` : "";
  return apiJson<SurgeryRecord[]>(`/api/v1/surgeries${q}`);
}

export async function scheduleSurgery(body: { patientId: string; procedureName: string; scheduledAt: string; chargeAmount?: number }): Promise<SurgeryRecord> {
  return apiJson<SurgeryRecord>("/api/v1/surgeries", { method: "POST", body: JSON.stringify(body) });
}

export async function updateSurgeryStatus(id: string, status: string): Promise<void> {
  await apiJson(`/api/v1/surgeries/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function listAdmissions(params?: { patientId?: string; activeOnly?: boolean }): Promise<AdmissionRecord[]> {
  const sp = new URLSearchParams();
  if (params?.patientId) sp.set("patientId", params.patientId);
  if (params?.activeOnly) sp.set("activeOnly", "true");
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return apiJson<AdmissionRecord[]>(`/api/v1/admissions${qs}`);
}

export async function admitPatient(body: { patientId: string; dailyRate?: number }): Promise<AdmissionRecord> {
  return apiJson<AdmissionRecord>("/api/v1/admissions", { method: "POST", body: JSON.stringify(body) });
}

export async function dischargePatient(id: string): Promise<void> {
  await apiJson(`/api/v1/admissions/${id}/discharge`, { method: "POST" });
}

export async function listGrooming(patientId?: string): Promise<GroomingRecord[]> {
  const q = patientId ? `?patientId=${patientId}` : "";
  return apiJson<GroomingRecord[]>(`/api/v1/grooming${q}`);
}

export async function bookGrooming(body: { patientId: string; scheduledAt: string; dogSize?: string; chargeAmount?: number; notes?: string }): Promise<GroomingRecord> {
  return apiJson<GroomingRecord>("/api/v1/grooming", { method: "POST", body: JSON.stringify(body) });
}

export async function updateGroomingStatus(id: string, status: string): Promise<void> {
  await apiJson(`/api/v1/grooming/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

// ----------------------------------------------------
// Finance & Expenses
// ----------------------------------------------------
export type Expense = {
  id: string;
  branchId: string | null;
  category: string;
  amount: number;
  incurredOn: string;
  notes: string | null;
  createdAt: string;
};

export type FinancialSummary = {
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  totalExpenses: number;
  netProfit: number;
  revenueByCategory: { category: string; amount: number }[];
  expensesByCategory: { category: string; amount: number }[];
};

export async function listExpenses(params?: { branchId?: string; category?: string }): Promise<Expense[]> {
  const sp = new URLSearchParams();
  if (params?.branchId) sp.set("branchId", params.branchId);
  if (params?.category) sp.set("category", params.category);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return apiJson<Expense[]>(`/api/v1/expenses${qs}`);
}

export async function createExpense(body: { branchId?: string; category: string; amount: number; incurredOn: string; notes?: string }): Promise<Expense> {
  return apiJson<Expense>("/api/v1/expenses", { method: "POST", body: JSON.stringify(body) });
}

export async function getFinancialSummary(): Promise<FinancialSummary> {
  return apiJson<FinancialSummary>("/api/v1/analytics/financial");
}

export type DailyRevenuePoint = { date: string; invoiced: number; collected: number };

export async function getDailyRevenue(days = 30): Promise<DailyRevenuePoint[]> {
  return apiJson<DailyRevenuePoint[]>(`/api/v1/analytics/daily-revenue?days=${days}`);
}

// ----------------------------------------------------
// Branches
// ----------------------------------------------------
export async function createBranch(body: { name: string }): Promise<Branch> {
  return apiJson<Branch>("/api/v1/branches", { method: "POST", body: JSON.stringify(body) });
}

// ----------------------------------------------------
// Appointments & Queue Triage
// ----------------------------------------------------
export type AppointmentItem = {
  id: string;
  branchId: string;
  patientId: string;
  clientId: string;
  doctorUserId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  version: number;
};

export async function listAppointments(): Promise<AppointmentItem[]> {
  return apiJson<AppointmentItem[]>("/api/v1/appointments");
}

export type QueueEntry = {
  id: string;
  branchId: string;
  appointmentId: string;
  patientId: string;
  doctorUserId: string;
  tokenNumber: number;
  priority: string;
  status: string;
  checkedInAt: string;
  version: number;
};

export async function listQueue(branchId: string): Promise<QueueEntry[]> {
  return apiJson<QueueEntry[]>(`/api/v1/queue?branchId=${branchId}`);
}

export async function updateQueueStatus(queueId: string, status: string): Promise<QueueEntry> {
  return apiJson<QueueEntry>(`/api/v1/queue/${queueId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function reassignQueueDoctor(queueId: string, doctorUserId: string): Promise<QueueEntry> {
  return apiJson<QueueEntry>(`/api/v1/queue/${queueId}/doctor`, {
    method: "PATCH",
    body: JSON.stringify({ doctorUserId }),
  });
}

// ----------------------------------------------------
// Services Catalog
// ----------------------------------------------------
export type ServiceItem = {
  id: string;
  code: string;
  name: string;
  defaultPrice: number;
  status: string;
  createdAt?: string;
  hsnSac?: string | null;
  /** GST percentage, e.g. 18 for 18%. */
  gstRate?: number;
};

export async function listServices(): Promise<ServiceItem[]> {
  return apiJson<ServiceItem[]>("/api/v1/services");
}

export async function createService(body: { code: string; name: string; defaultPrice: number; hsnSac?: string; gstRate?: number }): Promise<ServiceItem> {
  return apiJson<ServiceItem>("/api/v1/services", { method: "POST", body: JSON.stringify(body) });
}

export async function updateServiceTax(id: string, body: { hsnSac?: string; gstRate: number }): Promise<ServiceItem> {
  return apiJson<ServiceItem>(`/api/v1/services/${id}/tax`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function updateServiceStatus(id: string, status: string): Promise<ServiceItem> {
  return apiJson<ServiceItem>(`/api/v1/services/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

// ----------------------------------------------------
// Audit Trail
// ----------------------------------------------------
export type AuditEvent = {
  id: string;
  actorUserId: string | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string | null;
  createdAt: string;
};

export type AuditPage = {
  items: AuditEvent[];
  page: number;
  size: number;
  total: number;
};

export async function listAuditEvents(page = 0, size = 50): Promise<AuditPage> {
  return apiJson<AuditPage>(`/api/v1/audit-events?page=${page}&size=${size}`);
}

// ----------------------------------------------------
// Outbox & Communications & Reminders
// ----------------------------------------------------
export type OutboxEvent = {
  providerMessageId?: string | null;
  deliveryStatus?: string | null;
  id: string;
  eventType: string;
  status: string;
  createdAt: string;
  processedAt: string | null;
  attemptCount: number;
  lastError: string | null;
  nextAttemptAt: string | null;
};

export async function listOutboxEvents(limit = 50): Promise<OutboxEvent[]> {
  return apiJson<OutboxEvent[]>(`/api/v1/communications/outbox?limit=${limit}`);
}

export async function processOutboxNow(): Promise<{ eventsProcessed: number }> {
  return apiJson<{ eventsProcessed: number }>("/api/v1/communications/outbox/process-now", { method: "POST" });
}

export type WhatsAppIntegrationStatus = {
  accessTokenConfigured: boolean;
  phoneNumberIdConfigured: boolean;
  messagesUrl: string;
};

export async function getWhatsAppIntegrationStatus(): Promise<WhatsAppIntegrationStatus> {
  return apiJson<WhatsAppIntegrationStatus>("/api/v1/communications/whatsapp/status");
}

export async function sendWhatsApp(body: {
  to: string;
  template?: string;
  language?: string;
  body: string;
  templateParams?: string[];
  invoiceId?: string;
  sessionMessage?: boolean;
}): Promise<void> {
  await apiJson("/api/v1/communications/whatsapp", { method: "POST", body: JSON.stringify(body) });
}

export async function sendEmail(body: { to: string; subject: string; body: string }): Promise<void> {
  await apiJson("/api/v1/communications/email", { method: "POST", body: JSON.stringify(body) });
}

export type ReminderRunSummary = {
  appointmentsReminded: number;
  vaccinationsReminded: number;
  dewormingsReminded: number;
  followupsReminded?: number;
};

export type FollowUpCandidate = {
  consultationId: string;
  patientId: string;
  patientName: string;
  clientName: string;
  phone: string;
  email: string;
  doctorName: string;
  followUpOn: string;
};

export type VaxReminderCandidate = {
  id: string;
  vaccineName: string;
  nextDueOn: string;
  patientName: string;
  clientName: string;
  phone: string;
};

export type DewormReminderCandidate = {
  id: string;
  productName: string;
  nextDueOn: string;
  patientName: string;
  clientName: string;
  phone: string;
};

export type ApptReminderCandidate = {
  id: string;
  startsAt: string;
  patientName: string;
  clientName: string;
  phone: string;
  email: string;
};

export type LapsedClientCandidate = {
  clientId: string;
  clientName: string;
  phone: string;
  email: string;
  lastVisit: string;
  visitCount: number;
  patientNames: string;
};

export type AllClientCandidate = {
  clientId: string;
  clientName: string;
  phone: string;
  email: string;
  patientNames: string;
};

export type ReminderCohortsDto = {
  followUpsDue: FollowUpCandidate[];
  vaccinationsDue: VaxReminderCandidate[];
  dewormingsDue: DewormReminderCandidate[];
  appointmentsDue: ApptReminderCandidate[];
  lapsedClients: LapsedClientCandidate[];
  allClients: AllClientCandidate[];
};

export type BroadcastPayload = {
  cohort: "FOLLOWUPS_7D" | "VAX_7D" | "DEWORM_7D" | "APPOINTMENTS_24H" | "LAPSED_60D" | "ALL_CLIENTS";
  channel?: "WHATSAPP" | "EMAIL";
  template?: string;
  customMessage?: string;
  recipientClientIds?: string[];
};

export type BroadcastResultDto = {
  dispatchedCount: number;
  cohort: string;
  status: string;
};

export async function triggerReminders(): Promise<ReminderRunSummary> {
  return apiJson<ReminderRunSummary>("/api/v1/reminders/trigger", { method: "POST" });
}

export type ReminderSettings = {
  dailyRemindersEnabled: boolean;
};

export async function getReminderSettings(): Promise<ReminderSettings> {
  return apiJson<ReminderSettings>("/api/v1/reminders/settings");
}

export async function getReminderCohorts(): Promise<ReminderCohortsDto> {
  return apiJson<ReminderCohortsDto>("/api/v1/reminders/cohorts");
}

export async function broadcastToCohort(body: BroadcastPayload): Promise<Campaign> {
  return apiJson<Campaign>("/api/v1/reminders/broadcast", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ----------------------------------------------------
// Leads Pipeline
// ----------------------------------------------------
export type Lead = {
  id: string;
  displayName: string;
  status: string;
  phone?: string;
  email?: string;
  source?: string;
  notes?: string;
};

export async function listLeads(): Promise<Lead[]> {
  return apiJson<Lead[]>("/api/v1/leads");
}

export async function createLead(body: { displayName: string; phone?: string; email?: string; source?: string; notes?: string }): Promise<Lead> {
  return apiJson<Lead>("/api/v1/leads", { method: "POST", body: JSON.stringify(body) });
}

export async function updateLeadStatus(id: string, status: string): Promise<Lead> {
  return apiJson<Lead>(`/api/v1/leads/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

// ----------------------------------------------------
// Vaccinations
// ----------------------------------------------------
export type VaccinationRecord = {
  id: string;
  patientId: string;
  vaccineName: string;
  administeredOn: string;
  nextDueOn: string | null;
  batchNumber: string | null;
  notes: string | null;
};

export async function listVaccinations(patientId?: string): Promise<VaccinationRecord[]> {
  const q = patientId ? `?patientId=${patientId}` : "";
  return apiJson<VaccinationRecord[]>(`/api/v1/vaccinations${q}`);
}

export async function recordVaccination(body: {
  patientId: string;
  vaccineName: string;
  administeredOn: string;
  nextDueOn?: string;
  batchNumber?: string;
  notes?: string;
}): Promise<{ id: string; patientId: string; vaccineName: string }> {
  return apiJson<{ id: string; patientId: string; vaccineName: string }>("/api/v1/vaccinations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ----------------------------------------------------
// Vaccine protocols (defined by each clinic) and per-pet schedules
// ----------------------------------------------------
export type VaccineProtocol = {
  id: string;
  /** CANINE, FELINE, ... or ANY */
  speciesCode: string;
  vaccineName: string;
  aliases: string | null;
  firstDoseAgeWeeks: number | null;
  primaryDoses: number;
  primaryIntervalWeeks: number;
  boosterIntervalMonths: number | null;
  sortOrder: number;
  status: string;
};

export type VaccineProtocolInput = {
  speciesCode: string;
  vaccineName: string;
  aliases?: string;
  firstDoseAgeWeeks?: number | null;
  primaryDoses?: number;
  primaryIntervalWeeks?: number;
  boosterIntervalMonths?: number | null;
  sortOrder?: number;
};

export type VaccineScheduleEntry = {
  id: string;
  protocolId: string;
  vaccineName: string;
  doseLabel: string;
  dueOn: string;
  status: "DUE" | "DONE" | "SKIPPED";
  completedDoseId: string | null;
};

export async function listVaccineProtocols(): Promise<VaccineProtocol[]> {
  return apiJson<VaccineProtocol[]>("/api/v1/vaccine-protocols");
}

export async function createVaccineProtocol(body: VaccineProtocolInput): Promise<VaccineProtocol> {
  return apiJson<VaccineProtocol>("/api/v1/vaccine-protocols", { method: "POST", body: JSON.stringify(body) });
}

export async function updateVaccineProtocol(id: string, body: VaccineProtocolInput): Promise<VaccineProtocol> {
  return apiJson<VaccineProtocol>(`/api/v1/vaccine-protocols/${id}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function updateVaccineProtocolStatus(id: string, status: "ACTIVE" | "INACTIVE"): Promise<VaccineProtocol> {
  return apiJson<VaccineProtocol>(`/api/v1/vaccine-protocols/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function getVaccineSchedule(patientId: string): Promise<VaccineScheduleEntry[]> {
  return apiJson<VaccineScheduleEntry[]>(`/api/v1/patients/${patientId}/vaccine-schedule`);
}

export async function skipVaccineScheduleEntry(entryId: string): Promise<void> {
  await apiJson<void>(`/api/v1/vaccine-schedule/${entryId}/skip`, { method: "POST" });
}

// ----------------------------------------------------
// File Storage & Diagnostic Attachments
// ----------------------------------------------------
export type FileResponse = {
  id: string;
  fileName: string;
  byteSize: number;
  storageKey: string;
};

export async function uploadFile(entityType: string, entityId: string, file: File): Promise<FileResponse> {
  await ensureCsrf();
  const form = new FormData();
  form.append("entityType", entityType);
  form.append("entityId", entityId);
  form.append("file", file);

  const headers = new Headers();
  const csrf = readCookie("XSRF-TOKEN");
  if (csrf) {
    headers.set("X-XSRF-TOKEN", csrf);
  }

  const response = await fetchWithTimeout(`${apiUrl()}/api/v1/files`, {
    method: "POST",
    headers,
    body: form,
    credentials: "include",
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(error?.message ?? `Upload failed (${response.status})`);
  }
  return response.json() as Promise<FileResponse>;
}

export async function listFiles(entityType: string, entityId: string): Promise<FileResponse[]> {
  return apiJson<FileResponse[]>(`/api/v1/files?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`);
}

export function getFileDownloadUrl(fileId: string): string {
  return `${apiUrl()}/api/v1/files/${fileId}/download`;
}

// ----------------------------------------------------
// Data exports (owner)
// ----------------------------------------------------
export type ExportJob = {
  id: string;
  format: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
};

export async function listExportJobs(): Promise<ExportJob[]> {
  return apiJson<ExportJob[]>("/api/v1/exports");
}

export async function requestExport(format: string = "CSV"): Promise<{ id: string; format: string; status: string }> {
  return apiJson("/api/v1/exports", { method: "POST", body: JSON.stringify({ format }) });
}

export async function getExportJob(exportId: string): Promise<{
  id: string;
  format: string;
  status: string;
  artifactStorageKey?: string | null;
  completedAt?: string | null;
}> {
  return apiJson(`/api/v1/exports/${exportId}`);
}

export function getExportDownloadUrl(exportId: string): string {
  return `${apiUrl()}/api/v1/exports/${exportId}/download`;
}

// ----------------------------------------------------
// Notifications
// ----------------------------------------------------
export type AppNotification = {
  id: string;
  title: string;
  body: string;
  category: string;
  readAt?: string | null;
  createdAt: string;
};

export async function listNotifications(page = 0, size = 20): Promise<{ items: AppNotification[]; total: number }> {
  return apiJson(`/api/v1/notifications?page=${page}&size=${size}`);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const res = await apiJson<{ count: number }>("/api/v1/notifications/unread-count");
  return res.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiJson(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiJson("/api/v1/notifications/read-all", { method: "POST" });
}

// ----------------------------------------------------
// Refunds
// ----------------------------------------------------
export type PaymentRow = {
  id: string;
  invoiceId: string;
  method: string;
  amount: number;
  status: string;
  reference?: string | null;
  idempotencyKey: string;
  paidAt?: string | null;
};

export async function listRecentPayments(limit = 25): Promise<PaymentRow[]> {
  return apiJson<PaymentRow[]>(`/api/v1/payments/recent?limit=${limit}`);
}

export async function issueRefund(paymentId: string, body: { amount?: number; reason?: string }, idempotencyKey: string): Promise<void> {
  await apiJson(`/api/v1/payments/${paymentId}/refunds`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

// ----------------------------------------------------
// Campaigns
// ----------------------------------------------------
export type Campaign = {
  id: string;
  name: string;
  cohort: string;
  channel: string;
  status: string;
  targetedCount: number;
  sentCount: number;
  skippedOptOut: number;
  createdAt: string;
  completedAt?: string | null;
};

export async function listCampaigns(): Promise<Campaign[]> {
  return apiJson<Campaign[]>("/api/v1/campaigns");
}

export async function setClientMarketingOptOut(clientId: string, optOut: boolean): Promise<void> {
  await apiJson(`/api/v1/campaigns/clients/${clientId}/marketing-opt-out`, {
    method: "PATCH",
    body: JSON.stringify({ optOut }),
  });
}

// ----------------------------------------------------
// Copilot, offline sync, production gates
// ----------------------------------------------------
export async function copilotAdvise(patientId: string): Promise<{ patientId: string; suggestions: string[]; engineVersion: string }> {
  return apiJson(`/api/v1/copilot/patients/${patientId}/advise`, { method: "POST" });
}

export async function submitOfflineBatch(body: {
  deviceId: string;
  mutations: { clientMutationId: string; mutationType: string; payloadJson: string }[];
}): Promise<{ batchId: string; status: string; mutationCount: number }> {
  return apiJson("/api/v1/offline/batches", { method: "POST", body: JSON.stringify(body) });
}

export async function getProductionGates(): Promise<Record<string, unknown>> {
  return apiJson<Record<string, unknown>>("/api/v1/platform/production-gates");
}

// ----------------------------------------------------
// Online booking (public page and owner settings)
// ----------------------------------------------------
export type PublicBookingClinic = {
  name: string;
  address: string | null;
  phone: string | null;
  slotMinutes: number;
  maxDaysAhead: number;
  /** ISO weekdays, 1 = Monday */
  days: number[];
  timezone: string;
};

export type OnlineBookingSettings = {
  clinicName: string;
  enabled: boolean;
  slug: string | null;
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  days: number[];
};

export type BookingConfirmation = { appointmentId: string; startsAt: string; label: string; petName: string; clinicName: string };

export async function getPublicBookingClinic(slug: string): Promise<PublicBookingClinic> {
  return apiJson<PublicBookingClinic>(`/api/v1/public/booking/${encodeURIComponent(slug)}`);
}

export async function getPublicBookingSlots(slug: string, date: string): Promise<string[]> {
  return apiJson<string[]>(`/api/v1/public/booking/${encodeURIComponent(slug)}/slots?date=${date}`);
}

export async function createPublicBooking(
  slug: string,
  body: { ownerName: string; phone: string; petName: string; speciesCode: string; startsAt: string; reason?: string; whatsappConsent: boolean; website?: string }
): Promise<BookingConfirmation> {
  return apiJson<BookingConfirmation>(`/api/v1/public/booking/${encodeURIComponent(slug)}`, { method: "POST", body: JSON.stringify(body) });
}

export async function getOnlineBookingSettings(): Promise<OnlineBookingSettings> {
  return apiJson<OnlineBookingSettings>("/api/v1/clinic/online-booking");
}

export async function updateOnlineBookingSettings(body: Partial<Omit<OnlineBookingSettings, "clinicName">>): Promise<OnlineBookingSettings> {
  return apiJson<OnlineBookingSettings>("/api/v1/clinic/online-booking", { method: "PUT", body: JSON.stringify(body) });
}
