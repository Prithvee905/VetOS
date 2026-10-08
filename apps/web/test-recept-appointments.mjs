import puppeteer from "puppeteer-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  console.log("=== TESTING RECEPTIONIST APPOINTMENTS ACCESS ===");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new"
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on("pageerror", err => console.log("PAGE ERROR:", err.message));

  // Login as receptionist
  await page.goto("http://localhost:3000/");
  await page.type("#email", "reception@vetos.test");
  await page.type("#password", "receptPass123!");
  await page.click('button[type="submit"]');
  await sleep(2500);

  console.log("Receptionist logged in, URL:", page.url());

  // Navigate to /clinic
  await page.goto("http://localhost:3000/clinic");
  await sleep(2500);
  console.log("Receptionist on clinic station, URL:", page.url());

  // Click "Appointments & Roster"
  const apptTab = await page.$("button ::-p-text(Appointments & Roster)");
  console.log("Appointments & Roster tab found:", Boolean(apptTab));

  if (apptTab) {
    await apptTab.click();
    await sleep(2000);

    const bodyText = await page.evaluate(() => document.body.innerText);
    const visible = bodyText.includes("Doctor Roster & Daily Appointments");
    console.log("Receptionist can view Doctor Roster & Daily Appointments:", visible);
  }

  await browser.close();
})();
