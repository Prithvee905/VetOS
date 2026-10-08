import puppeteer from "puppeteer-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE_URL = "http://localhost:3000";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function test() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"],
  });

  const page = await browser.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle0" });

  console.log("On page:", page.url());
  const emailInput = await page.$("#email");
  const passwordInput = await page.$("#password");

  if (!emailInput || !passwordInput) {
    console.error("Inputs not found!");
    await browser.close();
    return;
  }

  await emailInput.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await emailInput.type("reception@vetos.test", { delay: 10 });

  await passwordInput.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await passwordInput.type("receptPass123!", { delay: 10 });

  const submitBtn = await page.$('button[type="submit"]');
  await submitBtn.click();

  await sleep(3000);
  console.log("After sign in URL:", page.url());
  const bodyText = await page.$eval("body", (el) => el.innerText.substring(0, 300));
  console.log("Body snippet:", bodyText.replace(/\n+/g, " | "));

  await browser.close();
}

test();
