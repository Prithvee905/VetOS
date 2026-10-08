import puppeteer from "puppeteer-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  console.log("=== TESTING STANDALONE POS INVOICING & PAYMENT COLLECTION ===");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new"
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on("pageerror", err => console.log("PAGE ERROR:", err.message));
  page.on("console", msg => console.log("CONSOLE:", msg.type(), msg.text()));

  // Login
  await page.goto("http://localhost:3000/");
  await page.type("#email", "co.owner@vetos.test");
  await page.type("#password", "ownerPass123!");
  await page.click('button[type="submit"]');
  await sleep(2500);
  console.log("Logged in:", page.url());

  // Go to /clinic
  await page.goto("http://localhost:3000/clinic");
  await sleep(2500);

  // Click "Unified Basket & POS"
  const posTab = await page.$("button ::-p-text(Unified Basket & POS)");
  if (!posTab) {
    console.error("Could not find Unified Basket & POS tab button!");
    await browser.close();
    return;
  }
  await posTab.click();
  await sleep(2000);

  // Check custom item desc
  const descInput = await page.$("#custom-item-desc");
  console.log("Found #custom-item-desc:", Boolean(descInput));

  if (descInput) {
    await page.type("#custom-item-desc", "QA3_TEST Standalone Wellness Pack");
    await page.click("#custom-item-price", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("#custom-item-price", "850");

    const addBtn = await page.$("button ::-p-text(+ Add Custom Cart Item)");
    if (addBtn) await addBtn.click();
    await sleep(1500);

    const issueBtn = await page.$("button ::-p-text(Issue Official Invoice)");
    const isDisabled = await (await issueBtn.getProperty("disabled")).jsonValue();
    console.log("Issue Official Invoice button exists:", Boolean(issueBtn), "disabled:", isDisabled);

    if (issueBtn && !isDisabled) {
      await issueBtn.click();
      await sleep(3500);

      const collectBtn = await page.$("button ::-p-text(Collect)");
      console.log("Collect button visible:", Boolean(collectBtn));

      if (collectBtn) {
        const text = await page.evaluate(el => el.textContent, collectBtn);
        console.log("Collect button text:", text);
        await collectBtn.click();
        await sleep(3500);

        const body = await page.evaluate(() => document.body.innerText);
        const settled = body.includes("Payment received and settled") || body.includes("The basket is empty");
        console.log("Payment settled successfully:", settled);
      }
    }
  }

  await browser.close();
})();
