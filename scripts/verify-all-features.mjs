// scripts/verify-all-features.mjs
// Comprehensive End-to-End Test Suite for VetOS System

const BASE_URL = "http://localhost:8080";

async function loginUser(email, password) {
  const cookieMap = new Map();

  function updateCookies(res) {
    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie") || ""];
    for (const c of cookies) {
      if (!c) continue;
      const part = c.split(";")[0].trim();
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        cookieMap.set(part.substring(0, eqIdx).trim(), part.substring(eqIdx + 1).trim());
      }
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
  return { user, cookie: getCookieHeader(), xsrfToken: cookieMap.get("XSRF-TOKEN") || "" };
}

async function run() {
  console.log("================================================================================");
  console.log("           VETOS PRODUCT END-TO-END VERIFICATION & AUDIT SUITE");
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

  // ---------------------------------------------------------------------------
  // 1. OWNER TEST
  // ---------------------------------------------------------------------------
  console.log("\n--- 1. Testing OWNER Role (owner@clinic.test) ---");
  const owner = await loginUser("owner@clinic.test", "change-me-now");
  assert(owner.user.roles.includes("OWNER"), "Owner authenticated successfully with role OWNER");

  // Owner Financial Analytics
  const finRes = await fetch(`${BASE_URL}/api/v1/analytics/financial`, {
    headers: { Cookie: owner.cookie },
  });
  assert(finRes.status === 200, "Owner can access Financial Analytics (200 OK)");
  const finData = await finRes.json();
  assert(typeof finData.totalInvoiced === "number", `Financial analytics loaded (Total Invoiced: $${finData.totalInvoiced})`);

  // Owner Expenses
  const expRes = await fetch(`${BASE_URL}/api/v1/expenses`, {
    headers: { Cookie: owner.cookie },
  });
  assert(expRes.status === 200, "Owner can access Expenses (200 OK)");

  // Owner Dashboard Overview
  const dashRes = await fetch(`${BASE_URL}/api/v1/dashboard/overview`, {
    headers: { Cookie: owner.cookie },
  });
  assert(dashRes.status === 200, "Owner can access Dashboard Overview");
  const dashData = await dashRes.json();
  assert(dashData.activeQueueCount !== undefined, `Queue count: ${dashData.activeQueueCount}`);

  // ---------------------------------------------------------------------------
  // 2. DOCTOR TEST
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Testing DOCTOR Role (dr.smith@vetos.test) ---");
  const doctor = await loginUser("dr.smith@vetos.test", "doctorPass123!");
  assert(doctor.user.roles.includes("DOCTOR"), "Doctor authenticated successfully with role DOCTOR");

  // Doctor Financial Privacy
  const docFinRes = await fetch(`${BASE_URL}/api/v1/analytics/financial`, {
    headers: { Cookie: doctor.cookie },
  });
  assert(docFinRes.status === 403, "Doctor is FORBIDDEN from Financial Analytics (403 Forbidden)");

  const docExpRes = await fetch(`${BASE_URL}/api/v1/expenses`, {
    headers: { Cookie: doctor.cookie },
  });
  assert(docExpRes.status === 403, "Doctor is FORBIDDEN from Expenses (403 Forbidden)");

  // Doctor Dashboard Masking
  const docDashRes = await fetch(`${BASE_URL}/api/v1/dashboard/overview`, {
    headers: { Cookie: doctor.cookie },
  });
  assert(docDashRes.status === 200, "Doctor can access Dashboard Overview");
  const docDashData = await docDashRes.json();
  assert(Number(docDashData.todayRevenue) === 0, `Doctor dashboard revenue is strictly masked to $0 (received: ${docDashData.todayRevenue})`);
  assert(Number(docDashData.outstandingDues) === 0, `Doctor dashboard dues is strictly masked to $0 (received: ${docDashData.outstandingDues})`);

  // Doctor Patient & Consultation Access
  const patientsRes = await fetch(`${BASE_URL}/api/v1/patients`, {
    headers: { Cookie: doctor.cookie },
  });
  assert(patientsRes.status === 200, "Doctor can list clinical patients (200 OK)");
  const patients = await patientsRes.json();
  assert(Array.isArray(patients), `Patients retrieved: ${patients.length} records`);

  // Doctor File Attachment Access (FILE_READ / FILE_WRITE)
  if (patients.length > 0) {
    const testPatientId = patients[0].id;
    const docFilesRes = await fetch(`${BASE_URL}/api/v1/files?entityType=PATIENT&entityId=${testPatientId}`, {
      headers: { Cookie: doctor.cookie },
    });
    assert(docFilesRes.status === 200, "Doctor has FILE_READ permission to review patient documents (200 OK)");

    // Test Doctor uploading a diagnostic file
    const formData = new FormData();
    formData.append("entityType", "PATIENT");
    formData.append("entityId", testPatientId);
    const blob = new Blob(["Diagnostic Blood Test Report: Normal RBC/WBC counts."], { type: "text/plain" });
    formData.append("file", blob, "blood-panel-report.txt");

    const uploadRes = await fetch(`${BASE_URL}/api/v1/files`, {
      method: "POST",
      headers: {
        Cookie: doctor.cookie,
        "X-XSRF-TOKEN": doctor.xsrfToken,
      },
      body: formData,
    });
    const uploadText = await uploadRes.text();
    if (!uploadRes.ok) {
      console.log("Upload error details:", uploadRes.status, uploadText);
    }
    assert(uploadRes.status === 201, "Doctor can upload a diagnostic file attachment (201 Created)");
    let uploadData = {};
    try { uploadData = JSON.parse(uploadText); } catch {}
    assert(uploadData.id !== undefined && uploadData.fileName === "blood-panel-report.txt", `File stored successfully (ID: ${uploadData.id})`);

    // Test downloading the file
    const downloadRes = await fetch(`${BASE_URL}/api/v1/files/${uploadData.id}/download`, {
      headers: { Cookie: doctor.cookie },
    });
    assert(downloadRes.status === 200, "Doctor can download stored diagnostic file (200 OK)");
  }

  // ---------------------------------------------------------------------------
  // 3. RECEPTIONIST TEST
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Testing RECEPTIONIST Role (reception@vetos.test) ---");
  const receptionist = await loginUser("reception@vetos.test", "receptPass123!");
  assert(receptionist.user.roles.includes("RECEPTIONIST"), "Receptionist authenticated with role RECEPTIONIST");

  // Receptionist Financial Privacy
  const recFinRes = await fetch(`${BASE_URL}/api/v1/analytics/financial`, {
    headers: { Cookie: receptionist.cookie },
  });
  assert(recFinRes.status === 403, "Receptionist is FORBIDDEN from Financial Analytics (403 Forbidden)");

  // Receptionist Inventory Access (CATALOG_WRITE & INVENTORY_WRITE)
  const productsRes = await fetch(`${BASE_URL}/api/v1/products`, {
    headers: { Cookie: receptionist.cookie },
  });
  assert(productsRes.status === 200, "Receptionist can view Products (200 OK)");

  const batchesRes = await fetch(`${BASE_URL}/api/v1/inventory/batches`, {
    headers: { Cookie: receptionist.cookie },
  });
  assert(batchesRes.status === 200, "Receptionist can view Inventory Batches (200 OK)");

  // Receptionist File Permissions (FILE_READ)
  if (patients.length > 0) {
    const recFilesRes = await fetch(`${BASE_URL}/api/v1/files?entityType=PATIENT&entityId=${patients[0].id}`, {
      headers: { Cookie: receptionist.cookie },
    });
    assert(recFilesRes.status === 200, "Receptionist has FILE_READ permission for patient records (200 OK)");
  }

  // ---------------------------------------------------------------------------
  // 4. STAFF TEST
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Testing STAFF Role (staff@vetos.test) ---");
  const staff = await loginUser("staff@vetos.test", "staffPass123!");
  assert(staff.user.roles.includes("STAFF"), "Staff authenticated with role STAFF");

  // Staff Inventory Access (CATALOG_WRITE & INVENTORY_WRITE)
  const staffProductsRes = await fetch(`${BASE_URL}/api/v1/products`, {
    headers: { Cookie: staff.cookie },
  });
  assert(staffProductsRes.status === 200, "Staff can view Products (200 OK)");

  const staffBatchesRes = await fetch(`${BASE_URL}/api/v1/inventory/batches`, {
    headers: { Cookie: staff.cookie },
  });
  assert(staffBatchesRes.status === 200, "Staff can view Inventory Batches (200 OK)");

  // Staff Financial Privacy
  const staffFinRes = await fetch(`${BASE_URL}/api/v1/analytics/financial`, {
    headers: { Cookie: staff.cookie },
  });
  assert(staffFinRes.status === 403, "Staff is FORBIDDEN from Financial Analytics (403 Forbidden)");

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
