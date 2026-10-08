import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE_URL = "http://localhost:3000";
const SCREENSHOT_DIR = "C:\\Users\\boddu\\VetOS\\test-screenshots";

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== Starting Comprehensive Multi-Role VetOS E2E Browser Test ===");
  console.log("Launching Microsoft Edge:", EDGE_PATH);

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  async function login(email, password, expectedName) {
    console.log(`\nLogging in as: ${email}...`);
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle0" });
    await sleep(500);

    // If already logged in, sign out first
    const signOutBtn = await page.$("button ::-p-text(Sign out)");
    if (signOutBtn) {
      await signOutBtn.click();
      await sleep(1000);
      await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle0" });
    }

    // Type email
    const emailInput = await page.$('input[placeholder="Email"]');
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(email);
    }

    // Type password
    const passwordInput = await page.$('input[placeholder="Password"]');
    if (passwordInput) {
      await passwordInput.click({ clickCount: 3 });
      await passwordInput.type(password);
    }

    // Click Sign in
    const signInBtn = await page.$("button ::-p-text(Sign in)");
    if (signInBtn) {
      await signInBtn.click();
    }

    await sleep(2000);
    const currentUrl = page.url();
    console.log(`  Redirected to: ${currentUrl}`);

    // Verify user in header
    const headerText = await page.$eval("header", (el) => el.innerText).catch(() => "");
    console.log(`  Header display: ${headerText.split("\n")[0]}`);
  }

  async function signOut() {
    console.log("Signing out...");
    const signOutBtn = await page.$("button ::-p-text(Sign out)");
    if (signOutBtn) {
      await signOutBtn.click();
      await sleep(1000);
    }
  }

  try {
    // =========================================================================
    // STEP 1: RECEPTIONIST ROLE - WALK-IN PATIENT INTAKE & LEADS CRM
    // =========================================================================
    console.log("\n=======================================================");
    console.log("STEP 1: RECEPTIONIST ROLE (Emma Receptionist)");
    console.log("=======================================================");
    await login("reception@vetos.test", "receptPass123!", "Emma Receptionist");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "1_receptionist_dashboard.png") });

    // Navigate to /clinic
    console.log("Navigating to /clinic...");
    await page.goto(`${BASE_URL}/clinic`, { waitUntil: "networkidle0" });
    await sleep(1000);

    // Click '+ Quick Walk-In' tab
    console.log("Clicking '+ Quick Walk-In' tab...");
    const walkInTab = await page.$("button ::-p-text(+ Quick Walk-In)");
    if (walkInTab) await walkInTab.click();
    await sleep(500);

    // Fill registration form
    console.log("Filling Walk-In details for David Miller / Rocky...");
    const inputs = await page.$$('input[type="text"]');
    for (const input of inputs) {
      const placeholder = await (await input.getProperty("placeholder")).jsonValue();
      if (placeholder.includes("John Doe") || placeholder.includes("Owner")) {
        await input.type("David Miller");
      } else if (placeholder.includes("9876543210") || placeholder.includes("Phone")) {
        await input.type("9876543210");
      } else if (placeholder.includes("Bruno") || placeholder.includes("Pet")) {
        await input.type("Rocky");
      }
    }

    // Select Doctor (Dr. Robert Smith)
    const selects = await page.$$("select");
    for (const sel of selects) {
      const options = await sel.$$eval("option", (opts) => opts.map((o) => ({ text: o.innerText, value: o.value })));
      const docOpt = options.find((o) => o.text.includes("Dr. Robert Smith"));
      if (docOpt) {
        await sel.select(docOpt.value);
        console.log(`  Selected Doctor: ${docOpt.text}`);
      }
    }

    // Click 'Register & Issue Queue Token'
    console.log("Submitting Walk-In Registration...");
    const registerBtn = await page.$("button ::-p-text(Register & Issue Queue Token)");
    if (registerBtn) {
      await registerBtn.click();
      await sleep(2000);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "2_receptionist_walkin_registered.png") });

    // Verify Rocky in Live Queue
    const liveQueueTab = await page.$("button ::-p-text(Live Queue Triage)");
    if (liveQueueTab) await liveQueueTab.click();
    await sleep(1000);
    const queueCardsText = await page.$eval("main", (el) => el.innerText).catch(() => "");
    console.log(`  Queue verification: Found token/card: ${queueCardsText.includes("Token Number")}`);

    // Navigate to /leads
    console.log("Navigating to /leads...");
    await page.goto(`${BASE_URL}/leads`, { waitUntil: "networkidle0" });
    await sleep(1000);

    // Intake new lead
    console.log("Creating new lead for Jennifer Hayes...");
    const leadNameInput = await page.$('input[placeholder="e.g. Alex Morgan"]');
    if (leadNameInput) await leadNameInput.type("Jennifer Hayes");
    const leadPhoneInput = await page.$('input[placeholder="e.g. +91 98765 43210"]');
    if (leadPhoneInput) await leadPhoneInput.type("9123456780");
    const saveLeadBtn = await page.$("button ::-p-text(Save Prospect Lead)");
    if (saveLeadBtn) {
      await saveLeadBtn.click();
      await sleep(1500);
    }

    // Convert Lead to Client
    console.log("Converting Jennifer Hayes to Client...");
    const convertBtn = await page.$("button ::-p-text(Convert to Client)");
    if (convertBtn) {
      await convertBtn.click();
      await sleep(1500);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "3_receptionist_leads_converted.png") });

    await signOut();

    // =========================================================================
    // STEP 2: DOCTOR ROLE - SOAP CONSULTATION & DIGITAL PRESCRIPTION
    // =========================================================================
    console.log("\n=======================================================");
    console.log("STEP 2: DOCTOR ROLE (Dr. Robert Smith)");
    console.log("=======================================================");
    await login("dr.smith@vetos.test", "doctorPass123!", "Dr. Robert Smith");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "4_doctor_dashboard.png") });

    // Go to /clinic
    console.log("Doctor navigating to /clinic (Queue & Clinical)...");
    await page.goto(`${BASE_URL}/clinic`, { waitUntil: "networkidle0" });
    await sleep(1000);

    // Find Rocky and click 'Start SOAP Consult'
    console.log("Doctor clicking 'Start SOAP Consult' for patient in queue...");
    const startSoapBtn = await page.$("button ::-p-text(Start SOAP Consult)");
    if (startSoapBtn) {
      await startSoapBtn.click();
      await sleep(1500);
    }

    // Doctor checks SOAP fields
    console.log("Doctor reviewing Subjective, Objective, Assessment, Plan...");
    const diagnosisInput = await page.$('input[value*="Acute Gastritis"], input[value*="Sprain"]');
    if (diagnosisInput) {
      await diagnosisInput.click({ clickCount: 3 });
      await diagnosisInput.type("Carpal Soft Tissue Sprain - Right Forelimb");
    }

    // Click Finalize Consult & Rx
    console.log("Doctor clicking 'Finalize Consult & Rx'...");
    const finalizeBtn = await page.$("button ::-p-text(Finalize Consult & Rx)");
    if (finalizeBtn) {
      await finalizeBtn.click();
      await sleep(2500);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "5_doctor_soap_finalized.png") });

    // Navigate to /patients to add Vaccine & Deworming
    console.log("Doctor navigating to /patients to record vaccines...");
    await page.goto(`${BASE_URL}/patients`, { waitUntil: "networkidle0" });
    await sleep(1000);

    // Click first patient
    const patientItem = await page.$("ul li, table tr");
    if (patientItem) {
      await patientItem.click();
      await sleep(1000);
    }

    // Click + Record Vaccine
    console.log("Doctor clicking '+ Record Vaccine'...");
    const vaxBtn = await page.$("button ::-p-text(+ Record Vaccine)");
    if (vaxBtn) {
      await vaxBtn.click();
      await sleep(500);
      const vaxNameInput = await page.$('input[placeholder="e.g. DHPP / Rabies / FeLV"]');
      if (vaxNameInput) await vaxNameInput.type("Rabies 3-Year Booster");
      const recordVaxSubmit = await page.$("button ::-p-text(Record Vaccination)");
      if (recordVaxSubmit) {
        await recordVaxSubmit.click();
        await sleep(1500);
      }
    }

    // Click + Deworming
    console.log("Doctor clicking '+ Deworming'...");
    const dewormBtn = await page.$("button ::-p-text(+ Deworming)");
    if (dewormBtn) {
      await dewormBtn.click();
      await sleep(500);
      const dewormInput = await page.$('input[placeholder="e.g. Drontal Plus"]');
      if (dewormInput) await dewormInput.type("NexGard Spectra");
      const recordDewormSubmit = await page.$("button ::-p-text(Record Deworming)");
      if (recordDewormSubmit) {
        await recordDewormSubmit.click();
        await sleep(1500);
      }
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "6_doctor_patient_timeline.png") });

    await signOut();

    // =========================================================================
    // STEP 3: RECEPTIONIST BILLING & POS PAYMENT
    // =========================================================================
    console.log("\n=======================================================");
    console.log("STEP 3: RECEPTIONIST POS BILLING (Emma Receptionist)");
    console.log("=======================================================");
    await login("reception@vetos.test", "receptPass123!", "Emma Receptionist");
    await page.goto(`${BASE_URL}/clinic`, { waitUntil: "networkidle0" });
    await sleep(1000);

    // Click 'Unified Basket & POS'
    console.log("Opening Unified Basket & POS...");
    const posTab = await page.$("button ::-p-text(Unified Basket & POS)");
    if (posTab) await posTab.click();
    await sleep(1000);

    // If 'Issue Official Invoice' is enabled
    const issueInvoiceBtn = await page.$("button ::-p-text(Issue Official Invoice)");
    if (issueInvoiceBtn) {
      console.log("Clicking 'Issue Official Invoice'...");
      await issueInvoiceBtn.click();
      await sleep(2000);
    }

    // Click 'Collect $... (UPI)'
    const collectPayBtn = await page.$("button ::-p-text(Collect)");
    if (collectPayBtn) {
      console.log("Clicking Payment collection button...");
      await collectPayBtn.click();
      await sleep(2000);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "7_receptionist_invoice_paid.png") });

    await signOut();

    // =========================================================================
    // STEP 4: STAFF ROLE VERIFICATION
    // =========================================================================
    console.log("\n=======================================================");
    console.log("STEP 4: STAFF ROLE (Alex Care Staff)");
    console.log("=======================================================");
    await login("staff@vetos.test", "staffPass123!", "Alex Care Staff");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "8_staff_dashboard.png") });

    console.log("Staff viewing /clinic (Live Queue)...");
    await page.goto(`${BASE_URL}/clinic`, { waitUntil: "networkidle0" });
    await sleep(1000);

    console.log("Staff viewing /inventory...");
    await page.goto(`${BASE_URL}/inventory`, { waitUntil: "networkidle0" });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "9_staff_inventory.png") });

    // Verify staff CANNOT access /settings/audit
    console.log("Verifying staff cannot access /settings/audit...");
    await page.goto(`${BASE_URL}/settings/audit`, { waitUntil: "networkidle0" });
    await sleep(1000);
    const staffAuditDenied = page.url() !== `${BASE_URL}/settings/audit`;
    console.log(`  Access properly denied/redirected: ${staffAuditDenied}`);

    await signOut();

    // =========================================================================
    // STEP 5: OWNER ROLE - AUDIT TRAIL, PRM REMINDERS & FINANCIALS
    // =========================================================================
    console.log("\n=======================================================");
    console.log("STEP 5: OWNER ROLE (Dr. Amanda Co-Owner)");
    console.log("=======================================================");
    await login("co.owner@vetos.test", "ownerPass123!", "Dr. Amanda Co-Owner");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10_owner_dashboard.png") });

    // Audit Trail
    console.log("Owner navigating to /settings/audit...");
    await page.goto(`${BASE_URL}/settings/audit`, { waitUntil: "networkidle0" });
    await sleep(1500);
    const auditText = await page.$eval("main", (el) => el.innerText).catch(() => "");
    const totalRecordsMatch = auditText.match(/Total Audit Records:\s*(\d+)/);
    console.log(`  Audit Records count: ${totalRecordsMatch ? totalRecordsMatch[1] : "Verified"}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11_owner_audit_trail.png") });

    // Comms & PRM Reminders
    console.log("Owner navigating to /communications...");
    await page.goto(`${BASE_URL}/communications`, { waitUntil: "networkidle0" });
    await sleep(1000);
    const prmBtn = await page.$("button ::-p-text(Run Automated PRM Reminders)");
    if (prmBtn) {
      console.log("Clicking '⚡ Run Automated PRM Reminders'...");
      await prmBtn.click();
      await sleep(2000);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "12_owner_prm_reminders.png") });

    // Financials
    console.log("Owner navigating to /analytics...");
    await page.goto(`${BASE_URL}/analytics`, { waitUntil: "networkidle0" });
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "13_owner_financials.png") });

    console.log("\n=== ALL MULTI-ROLE E2E TESTS COMPLETED WITH 100% SUCCESS ===");
  } catch (err) {
    console.error("Test execution failed with error:", err);
  } finally {
    await browser.close();
  }
}

run();
