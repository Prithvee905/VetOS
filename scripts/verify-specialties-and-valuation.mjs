// scripts/verify-specialties-and-valuation.mjs
const BASE_URL = "http://localhost:8080";

async function loginUser(email, password) {
  const cookieMap = new Map();

  function updateCookies(res) {
    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie") || ""];
    for (const c of cookies) {
      if (!c) continue;
      const [kv] = c.split(";");
      const [k, v] = kv.split("=");
      if (k && v) cookieMap.set(k.trim(), v.trim());
    }
  }

  function getCookieHeader() {
    return Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  // 1. Initial CSRF
  const csrfRes = await fetch(`${BASE_URL}/api/v1/auth/csrf`);
  updateCookies(csrfRes);

  // 2. Login
  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": cookieMap.get("XSRF-TOKEN") || "",
      Cookie: getCookieHeader(),
    },
    body: JSON.stringify({ email, password }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed for ${email}: ${loginRes.status} ${await loginRes.text()}`);
  }
  updateCookies(loginRes);

  // 3. Post-login CSRF sync
  const postCsrfRes = await fetch(`${BASE_URL}/api/v1/auth/csrf`, {
    headers: { Cookie: getCookieHeader() },
  });
  updateCookies(postCsrfRes);

  const user = await loginRes.json();
  return {
    user,
    cookie: getCookieHeader(),
    xsrfToken: cookieMap.get("XSRF-TOKEN") || "",
    apiCall: async (path, init = {}) => {
      if (init.method && init.method !== "GET") {
        const sync = await fetch(`${BASE_URL}/api/v1/auth/csrf`, {
          headers: { Cookie: getCookieHeader() },
        });
        updateCookies(sync);
      }
      const headers = {
        "Content-Type": "application/json",
        "X-XSRF-TOKEN": cookieMap.get("XSRF-TOKEN") || "",
        Cookie: getCookieHeader(),
        ...(init.headers || {}),
      };
      const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
      updateCookies(res);
      return res;
    },
  };
}

async function run() {
  console.log("================================================================================");
  console.log("       VERIFYING 4 CLINIC REAL-WORLD WORKFLOWS & WORKFLOW FIXES");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // Login as Clinic Owner
  const owner = await loginUser("dhaprirathvini897@gmail.com", "Tuby2018");
  console.log(`Logged in with clinic owner: ${owner.user.displayName} (${owner.user.roles.join(", ")})`);

  // ---------------------------------------------------------------------------
  // 1. Owner Discount Policy Cap Verification
  // ---------------------------------------------------------------------------
  console.log("\n--- 1. Testing Owner-Controlled Discount Policy (maxStaffDiscountPercent) ---");
  const clinicProfileRes = await owner.apiCall("/api/v1/clinic");
  assert(clinicProfileRes.status === 200, "Fetched clinic profile");
  const clinicProfile = await clinicProfileRes.json();
  console.log(`Current discount cap: ${clinicProfile.maxStaffDiscountPercent}%, Version: ${clinicProfile.version}`);

  const updateDiscountRes = await owner.apiCall("/api/v1/clinic", {
    method: "PATCH",
    body: JSON.stringify({
      version: clinicProfile.version,
      name: clinicProfile.name,
      maxStaffDiscountPercent: 20,
    }),
  });
  assert(updateDiscountRes.status === 200, "Owner updated clinic maxStaffDiscountPercent to 20%");
  const updatedProfile = await updateDiscountRes.json();
  assert(Number(updatedProfile.maxStaffDiscountPercent) === 20, "maxStaffDiscountPercent is verified as 20%");

  // ---------------------------------------------------------------------------
  // 2. Medicine Inventory: Company, Distributor, Purchase Price, Valuation
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Testing Medicine & Stock: Company, Distributor, Buy Price ---");
  // Create Distributor / Vendor
  const vendorRes = await owner.apiCall("/api/v1/vendors", {
    method: "POST",
    body: JSON.stringify({
      distributorName: "Apex Pharma Distributors",
      companyName: "Zoetis Global Healthcare",
      phone: "+91 9988776655",
    }),
  });
  assert(vendorRes.status === 200 || vendorRes.status === 201, "Created distributor vendor Apex Pharma Distributors");
  const vendor = await vendorRes.json();
  assert(vendor.distributorName === "Apex Pharma Distributors", `Distributor name matches: ${vendor.distributorName}`);

  // Create Product with Company, Distributor, Purchase Price, Selling Price
  const testSku = `MED-${Date.now().toString().slice(-6)}`;
  const prodRes = await owner.apiCall("/api/v1/products/item", {
    method: "POST",
    body: JSON.stringify({
      sku: testSku,
      name: "Synulox 250mg Clavulanate",
      unit: "STRIP",
      purchasePrice: 120.0,
      salePrice: 180.0,
      companyName: "Zoetis",
      distributorId: vendor.id,
    }),
  });
  assert(prodRes.status === 200 || prodRes.status === 201, `Created medicine product ${testSku} with purchasePrice ₹120 and salePrice ₹180`);
  const product = await prodRes.json();
  assert(product.companyName === "Zoetis", `Product manufacturer recorded: ${product.companyName}`);
  assert(product.distributorId === vendor.id, `Product distributor recorded: ${product.distributorName}`);
  assert(Number(product.purchasePrice) === 120, `Product buy price recorded: ₹${product.purchasePrice}`);

  // Fetch branches for batch
  const branchesRes = await owner.apiCall("/api/v1/branches");
  const branches = await branchesRes.json();
  const branchId = branches.items[0]?.id;

  // Create Batch with Cost Price & Vendor
  const batchRes = await owner.apiCall("/api/v1/inventory/batches", {
    method: "POST",
    body: JSON.stringify({
      productId: product.id,
      branchId: branchId,
      initialQuantity: 50,
      costPrice: 120.0,
      vendorId: vendor.id,
      expiresOn: "2027-12-31",
    }),
  });
  assert(batchRes.status === 200 || batchRes.status === 201, "Created stock batch of 50 units with costPrice ₹120.00");
  const batch = await batchRes.json();
  assert(Number(batch.costPrice) === 120, `Batch cost price verified: ₹${batch.costPrice}`);
  assert(batch.companyName === "Zoetis", `Batch inherited company name: ${batch.companyName}`);
  assert(batch.vendorName && batch.vendorName.includes("Apex Pharma Distributors"), `Batch inherited distributor: ${batch.vendorName}`);

  // List batches to verify valuation calculation
  const listBatchesRes = await owner.apiCall("/api/v1/inventory/batches");
  const allBatches = await listBatchesRes.json();
  const createdBatch = allBatches.find((b) => b.id === batch.id);
  assert(createdBatch !== undefined, "Batch found in inventory batch list");
  const batchValuation = createdBatch.quantityOnHand * createdBatch.costPrice;
  assert(batchValuation === 50 * 120, `Total batch cost valuation: ₹${batchValuation} (50 units * ₹120)`);

  // ---------------------------------------------------------------------------
  // 3. Specialties Procedure Fees & Dog Sizing Tiered Grooming
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Testing Specialties Charges & Dog Size Tiered Grooming ---");
  // Find or create a patient
  const patientsRes = await owner.apiCall("/api/v1/patients");
  const patients = await patientsRes.json();
  let patientId = patients[0]?.id;

  if (!patientId) {
    const clientRes = await owner.apiCall("/api/v1/clients", {
      method: "POST",
      body: JSON.stringify({ displayName: "Aarav Sharma", phone: "9876543210" }),
    });
    const client = await clientRes.json();
    const patRes = await owner.apiCall("/api/v1/patients", {
      method: "POST",
      body: JSON.stringify({
        clientId: client.id,
        name: "Bruno",
        speciesCode: "CANINE",
        breed: "Golden Retriever",
        sizeCategory: "LARGE",
      }),
    });
    const pat = await patRes.json();
    patientId = pat.id;
  }

  // 3a. Diagnostic Lab Order with charge
  const labRes = await owner.apiCall("/api/v1/labs", {
    method: "POST",
    body: JSON.stringify({
      patientId: patientId,
      testName: "Complete Blood Profile & Biochemistry",
      chargeAmount: 850.0,
    }),
  });
  assert(labRes.status === 200 || labRes.status === 201, "Created lab order with charge ₹850.00");
  const labOrder = await labRes.json();
  assert(Number(labOrder.chargeAmount) === 850, `Lab fee verified: ₹${labOrder.chargeAmount}`);

  // 3b. Surgery Procedure with charge
  const surgeryRes = await owner.apiCall("/api/v1/surgeries", {
    method: "POST",
    body: JSON.stringify({
      patientId: patientId,
      procedureName: "Ovariohysterectomy & Pre-Op Anesthesia",
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      chargeAmount: 4200.0,
    }),
  });
  assert(surgeryRes.status === 200 || surgeryRes.status === 201, "Scheduled surgery with procedure charge ₹4,200.00");
  const surgery = await surgeryRes.json();
  assert(Number(surgery.chargeAmount) === 4200, `Surgery procedure fee verified: ₹${surgery.chargeAmount}`);

  // 3c. IPD Admission with daily rate and auto-calculation
  const admitRes = await owner.apiCall("/api/v1/admissions", {
    method: "POST",
    body: JSON.stringify({
      patientId: patientId,
      dailyRate: 950.0,
    }),
  });
  assert(admitRes.status === 200 || admitRes.status === 201, "Admitted patient into IPD ward with daily rate ₹950.00/day");
  const admission = await admitRes.json();
  assert(Number(admission.dailyRate) === 950, `Daily hospitalization rate verified: ₹${admission.dailyRate}`);

  // Discharge admission
  const dischargeRes = await owner.apiCall(`/api/v1/admissions/${admission.id}/discharge`, {
    method: "POST",
  });
  assert(dischargeRes.status === 200 || dischargeRes.status === 204, "Discharged IPD admission");
  const admissionsListRes = await owner.apiCall("/api/v1/admissions");
  const admissionsList = await admissionsListRes.json();
  const dischargedAdmit = admissionsList.find((a) => a.id === admission.id);
  assert(dischargedAdmit.status === "DISCHARGED", "Status changed to DISCHARGED");
  assert(Number(dischargedAdmit.totalCharge) >= 950, `Total charge computed upon discharge: ₹${dischargedAdmit.totalCharge}`);

  // 3d. Dog Sized Tiered Grooming
  const groomingRes = await owner.apiCall("/api/v1/grooming", {
    method: "POST",
    body: JSON.stringify({
      patientId: patientId,
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      dogSize: "LARGE",
      chargeAmount: 1500.0,
      notes: "Full Spa Grooming & Medicated Oatmeal Bath",
    }),
  });
  assert(groomingRes.status === 200 || groomingRes.status === 201, "Booked grooming session with Dog Size LARGE and fee ₹1,500.00");
  const grooming = await groomingRes.json();
  assert(grooming.dogSize === "LARGE", `Dog size tier verified: ${grooming.dogSize}`);
  assert(Number(grooming.chargeAmount) === 1500, `Tiered grooming fee verified: ₹${grooming.chargeAmount}`);

  // ---------------------------------------------------------------------------
  // 4. Unified Basket & POS Invoice with Discounts
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Testing Unified POS Invoice & Discount Application ---");
  const invoiceRes = await owner.apiCall("/api/v1/invoices", {
    method: "POST",
    body: JSON.stringify({
      branchId: branchId,
      patientId: patientId,
      lines: [
        {
          sourceType: "SERVICE",
          description: `Grooming [LARGE]: Bruno`,
          quantity: 1,
          unitPrice: 1500,
          discountAmount: 150, // 10% discount
          taxRate: 0,
        },
        {
          sourceType: "SERVICE",
          description: `Lab Diagnostic: Complete Blood Profile`,
          quantity: 1,
          unitPrice: 850,
          discountAmount: 85, // 10% discount
          taxRate: 0,
        },
      ],
    }),
  });
  assert(invoiceRes.status === 200 || invoiceRes.status === 201, "Created official POS invoice with line discounts");
  const invoice = await invoiceRes.json();
  const subtotal = 1500 + 850; // 2350
  const expectedDiscount = 150 + 85; // 235
  const expectedTotal = subtotal - expectedDiscount; // 2115
  assert(Number(invoice.total) === expectedTotal, `Invoice total properly discounted: ₹${invoice.total} (was ₹${subtotal}, discount ₹${expectedDiscount})`);

  console.log("\n================================================================================");
  console.log(`                   SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
