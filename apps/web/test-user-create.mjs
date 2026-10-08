import puppeteer from "puppeteer-core";

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: "new"
  });
  const page = await browser.newPage();
  
  page.on("response", async res => {
    if (res.url().includes("/api/v1/users")) {
      console.log("USER API RES:", res.status(), res.request().method(), res.url());
      if (res.status() >= 400) {
        console.log("ERROR:", await res.text().catch(() => ""));
      }
    }
  });

  await page.goto("http://localhost:3000/");
  await page.type("#email", "co.owner@vetos.test");
  await page.type("#password", "ownerPass123!");
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 2000));

  await page.goto("http://localhost:3000/settings/users");
  await new Promise(r => setTimeout(r, 2000));

  const uniqueEmail = `qa3.staff.${Date.now()}@vetos.test`;
  await page.type('input[placeholder="Email"]', uniqueEmail);
  await page.type('input[placeholder="Display name"]', "QA3_TEST_Staff_Member");
  await page.type('input[placeholder="Temporary password"]', "staffPass123!");
  await page.select("select", "STAFF");

  const btn = await page.$('button[type="submit"]');
  console.log("Clicking 'Create user' button...");
  await btn.click();
  await new Promise(r => setTimeout(r, 3500));

  const listText = await page.$eval("main", m => m.innerText);
  console.log("User created visible in list?", listText.includes("QA3_TEST_Staff_Member"));
  console.log("Snippet:", listText.slice(0, 500).replace(/\n+/g, " | "));

  // Now verify that the newly created staff can log in!
  console.log("\nTesting login with newly created staff account...");
  const page2 = await browser.newPage();
  await page2.goto("http://localhost:3000/");
  await page2.type("#email", uniqueEmail);
  await page2.type("#password", "staffPass123!");
  await page2.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 3000));
  console.log("Staff logged in URL:", page2.url());
  const staffBody = await page2.$eval("body", b => b.innerText.slice(0, 300));
  console.log("Staff Header snippet:", staffBody.replace(/\n+/g, " | "));

  await browser.close();
})();
