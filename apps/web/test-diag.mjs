import puppeteer from "puppeteer-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new"
  });
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/");
  await page.type("#email", "co.owner@vetos.test");
  await page.type("#password", "ownerPass123!");
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2500));
  console.log("After login URL:", page.url());

  await page.goto("http://localhost:3000/clinic");
  await new Promise(r => setTimeout(r, 2000));
  console.log("Clinic URL:", page.url());

  const select = await page.$("#branch-switcher-select");
  console.log("Select #branch-switcher-select exists:", Boolean(select));

  const text = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log("Body snippet:\n", text);

  await browser.close();
})();
