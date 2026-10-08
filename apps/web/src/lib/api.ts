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
      throw new Error(
        "Cannot reach the VetOS API (timed out). Restart Docker Desktop, then run: docker compose up --build",
      );
    }
    throw new Error(
      "Cannot reach the VetOS API. Restart Docker Desktop, then run: docker compose up --build",
    );
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
  const response = await fetchWithTimeout(`${apiUrl()}${path}`, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as ApiError | null;
    throw new Error(error?.message ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  await ensureCsrf();
  return apiJson<SessionUser>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function currentUser(): Promise<SessionUser> {
  return apiJson<SessionUser>("/api/v1/auth/me");
}

export async function logout(): Promise<void> {
  await apiJson<void>("/api/v1/auth/logout", { method: "POST" });
}

export type Branch = { id: string; name: string; status: string };

export type ClientRow = {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  status: string;
};

export type PatientRow = {
  id: string;
  clientId: string;
  name: string;
  speciesCode: string;
  sizeCategory: string;
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
  lines: { id: string; description: string; lineTotal: string }[];
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
}): Promise<ClientRow> {
  const payload = {
    consentWhatsapp: body.consentWhatsapp ?? false,
    consentEmail: body.consentEmail ?? false,
    ...body,
  };
  return apiJson<ClientRow>("/api/v1/clients", { method: "POST", body: JSON.stringify(payload) });
}

export async function listPatients(clientId?: string): Promise<PatientRow[]> {
  const query = clientId ? `?clientId=${clientId}` : "";
  return apiJson<PatientRow[]>(`/api/v1/patients${query}`);
}

export async function createPatient(body: Record<string, unknown>): Promise<PatientRow> {
  return apiJson<PatientRow>("/api/v1/patients", { method: "POST", body: JSON.stringify(body) });
}

export async function listUsers(): Promise<{ items: UserRowBrief[] }> {
  return apiJson<{ items: UserRowBrief[] }>("/api/v1/users");
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

export type DashboardOverview = {
  todayAppointmentsCount: number;
  activeQueueCount: number;
  todayRevenue: number;
  activePatientsCount: number;
  lowStockCount: number;
  hospitalizedCount: number;
  vaccinationsDue: DueAlert[];
  dewormingsDue: DueAlert[];
};

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
};

export type InventoryBatch = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  branchId: string;
  quantityOnHand: number;
  expiresOn: string | null;
};

export type StockMovement = {
  id: string;
  batchId: string;
  movementType: string;
  quantity: number;
  reference: string;
  createdAt: string;
};

export async function listProducts(query?: string): Promise<Product[]> {
  const q = query ? `?query=${encodeURIComponent(query)}` : "";
  return apiJson<Product[]>(`/api/v1/products${q}`);
}

export async function createProduct(body: { sku: string; name: string; unit?: string; salePrice: number }): Promise<Product> {
  return apiJson<Product>("/api/v1/products/item", { method: "POST", body: JSON.stringify(body) });
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

export async function createBatch(body: { productId: string; branchId: string; initialQuantity: number; expiresOn?: string }): Promise<InventoryBatch> {
  return apiJson<InventoryBatch>("/api/v1/inventory/batches", { method: "POST", body: JSON.stringify(body) });
}

export async function adjustStock(body: { batchId: string; quantityChange: number; reason: string }): Promise<{ batchId: string; updatedQuantityOnHand: number }> {
  return apiJson("/api/v1/inventory/adjustments", { method: "POST", body: JSON.stringify(body) });
}

export async function listBatchMovements(batchId: string): Promise<StockMovement[]> {
  return apiJson<StockMovement[]>(`/api/v1/inventory/batches/${batchId}/movements`);
}

export async function dispensePrescription(body: { prescriptionId: string; items: { batchId: string; quantity: number }[] }): Promise<{ prescriptionId: string; status: string }> {
  return apiJson("/api/v1/pharmacy/dispense", { method: "POST", body: JSON.stringify(body) });
}

// ----------------------------------------------------
// Procurement & Vendors
// ----------------------------------------------------
export type Vendor = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
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

export async function createVendor(body: { name: string; phone?: string; email?: string }): Promise<Vendor> {
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
  orderedAt: string;
};

export type SurgeryRecord = {
  id: string;
  patientId: string;
  patientName: string;
  procedureName: string;
  scheduledAt: string;
  status: string;
};

export type AdmissionRecord = {
  id: string;
  patientId: string;
  patientName: string;
  admittedAt: string;
  dischargedAt: string | null;
  status: string;
};

export type GroomingRecord = {
  id: string;
  patientId: string;
  patientName: string;
  scheduledAt: string;
  status: string;
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

export async function createLabOrder(body: { patientId: string; testName: string }): Promise<LabOrder> {
  return apiJson<LabOrder>("/api/v1/labs", { method: "POST", body: JSON.stringify(body) });
}

export async function updateLabStatus(id: string, status: string): Promise<void> {
  await apiJson(`/api/v1/labs/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function listSurgeries(patientId?: string): Promise<SurgeryRecord[]> {
  const q = patientId ? `?patientId=${patientId}` : "";
  return apiJson<SurgeryRecord[]>(`/api/v1/surgeries${q}`);
}

export async function scheduleSurgery(body: { patientId: string; procedureName: string; scheduledAt: string }): Promise<SurgeryRecord> {
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

export async function admitPatient(body: { patientId: string }): Promise<AdmissionRecord> {
  return apiJson<AdmissionRecord>("/api/v1/admissions", { method: "POST", body: JSON.stringify(body) });
}

export async function dischargePatient(id: string): Promise<void> {
  await apiJson(`/api/v1/admissions/${id}/discharge`, { method: "POST" });
}

export async function listGrooming(patientId?: string): Promise<GroomingRecord[]> {
  const q = patientId ? `?patientId=${patientId}` : "";
  return apiJson<GroomingRecord[]>(`/api/v1/grooming${q}`);
}

export async function bookGrooming(body: { patientId: string; scheduledAt: string; notes?: string }): Promise<GroomingRecord> {
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

// ----------------------------------------------------
// Services Catalog
// ----------------------------------------------------
export type ServiceItem = {
  id: string;
  code: string;
  name: string;
  defaultPrice: number;
  status: string;
  createdAt: string;
};

export async function listServices(): Promise<ServiceItem[]> {
  return apiJson<ServiceItem[]>("/api/v1/services");
}

export async function createService(body: { code: string; name: string; defaultPrice: number }): Promise<ServiceItem> {
  return apiJson<ServiceItem>("/api/v1/services", { method: "POST", body: JSON.stringify(body) });
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
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  createdAt: string;
  processedAt: string | null;
  retryCount: number;
  lastError: string | null;
};

export async function listOutboxEvents(limit = 50): Promise<OutboxEvent[]> {
  return apiJson<OutboxEvent[]>(`/api/v1/communications/outbox?limit=${limit}`);
}

export async function sendWhatsApp(body: { to: string; template?: string; language?: string; body: string }): Promise<void> {
  await apiJson("/api/v1/communications/whatsapp", { method: "POST", body: JSON.stringify(body) });
}

export async function sendEmail(body: { to: string; subject: string; body: string }): Promise<void> {
  await apiJson("/api/v1/communications/email", { method: "POST", body: JSON.stringify(body) });
}

export type ReminderRunSummary = {
  appointmentsReminded: number;
  vaccinationsReminded: number;
  dewormingsReminded: number;
};

export async function triggerReminders(): Promise<ReminderRunSummary> {
  return apiJson<ReminderRunSummary>("/api/v1/reminders/trigger", { method: "POST" });
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


