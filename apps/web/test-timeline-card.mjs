import puppeteer from "puppeteer-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new"
  });
  const page = await browser.newPage();
  
  await page.goto("http://localhost:3000/");
  await page.type("#email", "dr.smith@vetos.test");
  await page.type("#password", "doctorPass123!");
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  await page.goto("http://localhost:3000/patients");
  await new Promise(r => setTimeout(r, 2000));

  // Click on the first patient card in the directory
  const patientCard = await page.$('div.overflow-y-auto button');
  if (patientCard) {
    console.log("Clicking on patient card...");
    await patientCard.click();
    await new Promise(r => setTimeout(r, 2500));

    const rightPane = await page.$eval('div.lg\\:col-span-8', el => el.innerText);
    console.log("Timeline Pane Text:\n", rightPane.slice(0, 500).replace(/\n+/g, " | "));
  } else {
    console.log("No patient card found!");
  }

  await browser.close();
})();
