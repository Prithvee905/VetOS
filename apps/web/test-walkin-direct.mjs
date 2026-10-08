import puppeteer from "puppeteer-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  console.log("=== TESTING WALK-IN REGISTRATION & LIVE QUEUE TOKEN ===");
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

  // Go to /clinic
  await page.goto("http://localhost:3000/clinic");
  await sleep(2500);

  // Click "+ Quick Walk-In"
  const walkTab = await page.$("button ::-p-text(+ Quick Walk-In)");
  if (!walkTab) {
    console.error("Quick Walk-In tab button not found!");
    await browser.close();
    return;
  }
  await walkTab.click();
  await sleep(1500);

  const testPetName = `QA3_WalkIn_${Date.now().toString().slice(-4)}`;
  await page.type("#reg-client-name", "QA3_TEST_Owner_Verified");
  await page.type("#reg-client-phone", "9876543210");
  await page.type("#reg-pet-name", testPetName);
  await page.type("#reg-breed-input", "Golden Retriever");

  const doctorVal = await page.$eval("#reg-doctor-select option:nth-child(2)", el => el.value);
  await page.select("#reg-doctor-select", doctorVal);
  await sleep(1000);

  const submitBtn = await page.$("#btn-register-walkin");
  await submitBtn.click();
  await sleep(4000);

  // The form automatically redirects to Live Queue tab in onSuccess
  const queueBoardText = await page.evaluate(() => document.body.innerText);
  const found = queueBoardText.includes(testPetName);
  console.log(`Queue token for ${testPetName} visible on Live Queue:`, found);

  // Test persistence across reload
  await page.reload();
  await sleep(3000);
  const reloadedText = await page.evaluate(() => document.body.innerText);
  const persisted = reloadedText.includes(testPetName);
  console.log(`Queue token persisted after page reload:`, persisted);

  await browser.close();
})();
