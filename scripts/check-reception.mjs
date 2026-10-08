import puppeteer from "puppeteer-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new"
  });
  const page = await browser.newPage();
  await page.goto("http://localhost:3000/");
  await page.type("#email", "reception@vetos.test");
  await page.type("#password", "receptionPass123!");
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));
  await page.goto("http://localhost:3000/clinic");
  await new Promise(r => setTimeout(r, 2000));
  console.log("URL:", page.url());
  const text = await page.$eval("main", m => m.innerText);
  console.log("Main snippet:", text.slice(0, 400).replace(/\n+/g, " | "));
  
  // Click Appointments & Roster tab
  const apptTab = await page.$("button ::-p-text(Appointments & Roster)");
  if (apptTab) {
    await apptTab.click();
    await new Promise(r => setTimeout(r, 1000));
    const apptText = await page.$eval("main", m => m.innerText);
    console.log("Appointments tab text:", apptText.slice(0, 400).replace(/\n+/g, " | "));
  } else {
    console.log("Appointments tab button NOT FOUND!");
  }
  await browser.close();
})();
