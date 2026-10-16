import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const ARTIFACT_DIR = "C:\\Users\\boddu\\.gemini\\antigravity-ide\\brain\\be1ab6a0-9907-4b65-9f3e-551c91cd5073";

(async () => {
  console.log("Starting browser visual verification of all 4 workflows...");
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();

  // 1. Login as Owner
  await page.goto("http://localhost:3000/");
  await page.waitForSelector("#email");
  await page.type("#email", "owner@clinic.test");
  await page.type("#password", "change-me-now");
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2500));

  // 2. Capture Specialties Page (Grooming tab with Dog Size tiering & fees)
  console.log("Navigating to Specialties...");
  await page.goto("http://localhost:3000/specialties");
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "specialties_labs.png"), fullPage: true });

  // Click Grooming tab
  const groomingTab = await page.$("button ::-p-text(Grooming & Spa)");
  if (groomingTab) {
    await groomingTab.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "specialties_grooming_tiered.png"), fullPage: true });

    // Open Book Grooming Modal to verify Dog Size Selector
    const bookGroomingBtn = await page.$("button ::-p-text(Book Grooming Session)");
    if (bookGroomingBtn) {
      await bookGroomingBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "grooming_modal_dog_size.png") });
      // Close modal
      const cancelBtn = await page.$("button ::-p-text(Cancel)");
      if (cancelBtn) await cancelBtn.click();
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 3. Capture Inventory & Medicine Master Page (KPIs, Company, Distributor, Buy Price, Margins)
  console.log("Navigating to Inventory...");
  await page.goto("http://localhost:3000/inventory");
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "inventory_stock_valuation.png"), fullPage: true });

  // Click Catalog / Products Directory
  const catalogTab = await page.$("button ::-p-text(Catalog / Product Directory)");
  if (catalogTab) {
    await catalogTab.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "inventory_product_catalog.png"), fullPage: true });

    // Open Add Product Modal to verify Manufacturer, Distributor, Buy Price & Margin calculator
    const addProdBtn = await page.$("button ::-p-text(Add Product / Medicine)");
    if (addProdBtn) {
      await addProdBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "inventory_add_product_modal.png") });
      const cancelBtn = await page.$("button ::-p-text(Cancel)");
      if (cancelBtn) await cancelBtn.click();
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 4. Capture Clinic POS & Unified Basket (Discount Controls, Staff Cap, Owner Override)
  console.log("Navigating to Clinic Unified Basket & POS...");
  await page.goto("http://localhost:3000/clinic");
  await new Promise(r => setTimeout(r, 2000));

  // Switch to Unified Basket tab
  const posTab = await page.$("button ::-p-text(Unified Basket & POS)");
  if (posTab) {
    await posTab.click();
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "clinic_pos_basket_discounts.png"), fullPage: true });
  }

  // 5. Capture Clinic Settings (Owner Discount Policy)
  console.log("Navigating to Clinic Settings...");
  await page.goto("http://localhost:3000/settings/clinic");
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "settings_owner_discount_policy.png"), fullPage: true });

  console.log("Visual verification complete! All screenshots saved.");
  await browser.close();
})();
