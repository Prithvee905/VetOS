import puppeteer from "puppeteer-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new"
  });
  const page = await browser.newPage();
  
  page.on("console", msg => console.log("BROWSER LOG:", msg.type(), msg.text()));
  page.on("pageerror", err => console.log("PAGE ERROR:", err.message));
  page.on("response", async res => {
    if (res.url().includes("/api/")) {
      console.log("API RES:", res.status(), res.request().method(), res.url());
      if (res.status() >= 400) {
        console.log("ERROR BODY:", await res.text().catch(() => ""));
      }
    }
  });

  await page.goto("http://localhost:3000/");
  await page.type("#email", "co.owner@vetos.test");
  await page.type("#password", "ownerPass123!");
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  await page.goto("http://localhost:3000/clinic");
  await new Promise(r => setTimeout(r, 2000));

  // Click "+ Quick Walk-In"
  const walkTab = await page.$("button ::-p-text(+ Quick Walk-In)");
  if (walkTab) await walkTab.click();
  await new Promise(r => setTimeout(r, 1000));

  await page.type("#reg-client-name", "QA3_TEST_Owner_Real");
  await page.type("#reg-client-phone", "9876543210");
  await page.type("#reg-pet-name", "QA3_TEST_Max_Real");
  await page.type("#reg-breed-input", "Labrador Retriever");

  const docSelect = await page.$("#reg-doctor-select");
  if (docSelect) {
    const docOpts = await page.$$eval("#reg-doctor-select option", opts => opts.map(o => o.value).filter(Boolean));
    console.log("Doctor options in select:", docOpts);
    if (docOpts.length > 0) {
      await page.select("#reg-doctor-select", docOpts[0]);
    }
  }

  const btn = await page.$("#btn-register-walkin");
  const isDisabled = await (await btn.getProperty("disabled")).jsonValue();
  console.log("Button disabled after page.type?", isDisabled);

  if (!isDisabled) {
    console.log("Clicking #btn-register-walkin...");
    await btn.click();
    await new Promise(r => setTimeout(r, 4000));
  }

  const queueTab = await page.$("button ::-p-text(Live Queue Triage)");
  if (queueTab) await queueTab.click();
  await new Promise(r => setTimeout(r, 1500));

  const bodyText = await page.$eval("main", m => m.innerText);
  console.log("Main text after click:\n", bodyText.slice(0, 500).replace(/\n+/g, " | "));

  await browser.close();
})();
