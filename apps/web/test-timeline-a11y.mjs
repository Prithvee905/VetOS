import puppeteer from "puppeteer-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  console.log("=== TESTING PATIENT MEDICAL TIMELINE & MODAL ACCESSIBILITY ===");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new"
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on("pageerror", err => console.log("PAGE ERROR:", err.message));

  // Login
  await page.goto("http://localhost:3000/");
  await page.type("#email", "co.owner@vetos.test");
  await page.type("#password", "ownerPass123!");
  await page.click('button[type="submit"]');
  await sleep(2500);

  // Navigate to /patients
  await page.goto("http://localhost:3000/patients");
  await sleep(2500);

  // 1. Check patient directory
  const patientBtns = await page.$$(".max-h-\\[600px\\] button");
  console.log("Patient buttons in directory:", patientBtns.length);

  if (patientBtns.length > 0) {
    await patientBtns[0].click();
    await sleep(2500);

    const timelineHeading = await page.$eval("h4", el => el.textContent).catch(() => "");
    console.log("Timeline heading:", timelineHeading);

    const badges = await page.$$eval(".rounded-xl.border.bg-white span", spans =>
      spans.map(s => s.textContent.trim()).filter(t => ["CONSULTATION", "VACCINE", "DEWORMING", "INVOICE", "LAB", "COMPLETED"].includes(t))
    );
    console.log("Detected timeline badges:", badges);
    console.log("Timeline Chronology verified:", timelineHeading.includes("Medical Record Chronology") && badges.length > 0);
  }

  // 2. Check modal accessibility IDs (DEF-002)
  const newOwnerBtn = await page.$("button ::-p-text(+ Register Owner)");
  if (newOwnerBtn) {
    await newOwnerBtn.click();
    await sleep(1500);
    const ownerInput = await page.$("#owner-modal-fullname");
    const ownerLabel = await page.$('label[for="owner-modal-fullname"]');
    console.log("Owner modal input and label verified:", Boolean(ownerInput && ownerLabel));
    const cancelBtn = await page.$("button ::-p-text(Cancel)");
    if (cancelBtn) await cancelBtn.click();
  }

  const newPetBtn = await page.$("button ::-p-text(+ Register Pet)");
  if (newPetBtn) {
    await newPetBtn.click();
    await sleep(1500);
    const petInput = await page.$("#pet-modal-name");
    const petLabel = await page.$('label[for="pet-modal-name"]');
    console.log("Pet modal input and label verified:", Boolean(petInput && petLabel));
    const cancelBtn = await page.$("button ::-p-text(Cancel)");
    if (cancelBtn) await cancelBtn.click();
  }

  await browser.close();
})();
