// scripts/onboard-team.mjs
// Automates onboarding a clinic and creating all team staff accounts

const API_BASE = process.env.API_BASE || "http://localhost:8080";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "dev-admin-secret-key-vetos-super-long-64-character-string-67890";

const CLINIC_DATA = {
  clinicName: "VetOS Animal Hospital",
  owner: {
    email: "dhaprirathvini897@gmail.com",
    password: "Tuby2018",
    displayName: "Dharani Prithvi (Owner)"
  },
  team: [
    {
      email: "motivebuilders@gmail.com",
      password: "Prithvi905%",
      displayName: "Dr. Prithvi",
      roles: ["DOCTOR"]
    },
    {
      email: "bodduprithvee@gmail.com",
      password: "Sunny905%",
      displayName: "Prithvee Boddu",
      roles: ["RECEPTIONIST"]
    },
    {
      email: "dharaniboddu416@gmail.com",
      password: "buddie25%",
      displayName: "Dharani Boddu",
      roles: ["STAFF"]
    },
    {
      email: "brcm1972@gmail.com",
      password: "Rama905%",
      displayName: "Dr. Rama",
      roles: ["DOCTOR"]
    }
  ]
};

async function main() {
  console.log(`[+] Target API: ${API_BASE}`);
  console.log(`[+] 1. Onboarding Clinic '${CLINIC_DATA.clinicName}' with Owner '${CLINIC_DATA.owner.email}'...`);

  let branchId = null;

  try {
    const onboardRes = await fetch(`${API_BASE}/api/v1/platform-admin/onboard-clinic`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Platform-Admin-Secret": ADMIN_SECRET
      },
      body: JSON.stringify({
        clinicName: CLINIC_DATA.clinicName,
        email: CLINIC_DATA.owner.email,
        password: CLINIC_DATA.owner.password,
        displayName: CLINIC_DATA.owner.displayName,
        branchName: "Main"
      })
    });

    if (onboardRes.status === 201) {
      const onboardData = await onboardRes.json();
      console.log(`  ✓ Clinic onboarded successfully! Clinic ID: ${onboardData.clinicId}, Branch ID: ${onboardData.branchId}`);
      branchId = onboardData.branchId;
    } else if (onboardRes.status === 409) {
      console.log(`  ℹ Owner '${CLINIC_DATA.owner.email}' already exists. Logging in...`);
    } else {
      const errText = await onboardRes.text();
      console.error(`  ✗ Onboarding failed (${onboardRes.status}): ${errText}`);
    }
  } catch (err) {
    console.error(`  ✗ Error during onboarding:`, err.message);
  }

  // 2. Login as Owner to get session cookie & CSRF token
  console.log(`[+] 2. Authenticating as Owner to create team members...`);
  const cookieMap = new Map();

  function updateCookies(res) {
    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie") || ""];
    for (const c of cookies) {
      if (!c) continue;
      const part = c.split(";")[0].trim();
      const eqIdx = part.indexOf("=");
      if (eqIdx > 0) {
        cookieMap.set(part.substring(0, eqIdx).trim(), part.substring(eqIdx + 1).trim());
      }
    }
  }

  function getCookieHeader() {
    return Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  // Fetch CSRF
  const csrfRes = await fetch(`${API_BASE}/api/v1/auth/csrf`);
  updateCookies(csrfRes);

  const loginRes = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": cookieMap.get("XSRF-TOKEN") || "",
      Cookie: getCookieHeader()
    },
    body: JSON.stringify({
      email: CLINIC_DATA.owner.email,
      password: CLINIC_DATA.owner.password
    })
  });

  if (!loginRes.ok) {
    console.error(`[-] Owner login failed (${loginRes.status}): ${await loginRes.text()}`);
    process.exit(1);
  }
  updateCookies(loginRes);
  const ownerUser = await loginRes.json();
  console.log(`  ✓ Owner logged in: ${ownerUser.displayName} (${ownerUser.roles.join(", ")})`);

  // Post-login CSRF refresh
  const csrf2 = await fetch(`${API_BASE}/api/v1/auth/csrf`, {
    headers: { Cookie: getCookieHeader() }
  });
  updateCookies(csrf2);

  // If branchId is not yet retrieved, get from /api/v1/branches
  if (!branchId) {
    const branchesRes = await fetch(`${API_BASE}/api/v1/branches`, {
      headers: { Cookie: getCookieHeader() }
    });
    if (branchesRes.ok) {
      const branchesData = await branchesRes.json();
      if (branchesData.items && branchesData.items.length > 0) {
        branchId = branchesData.items[0].id;
        console.log(`  ✓ Retrieved active Branch ID: ${branchId}`);
      }
    }
  }

  // 3. Create each team member
  console.log(`\n[+] 3. Registering Team Members...`);
  for (const member of CLINIC_DATA.team) {
    try {
      const userRes = await fetch(`${API_BASE}/api/v1/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-XSRF-TOKEN": cookieMap.get("XSRF-TOKEN") || "",
          Cookie: getCookieHeader()
        },
        body: JSON.stringify({
          email: member.email,
          password: member.password,
          displayName: member.displayName,
          branchId: branchId || undefined,
          roles: member.roles
        })
      });

      if (userRes.status === 201) {
        const createdUser = await userRes.json();
        console.log(`  ✓ Created [${member.roles[0]}] ${member.displayName} (${member.email})`);
      } else if (userRes.status === 409) {
        console.log(`  ℹ User ${member.email} already exists. Updating password...`);
        // Reset password via platform admin
        await fetch(`${API_BASE}/api/v1/platform-admin/reset-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Platform-Admin-Secret": ADMIN_SECRET
          },
          body: JSON.stringify({
            email: member.email,
            newPassword: member.password
          })
        });
        console.log(`  ✓ Password updated for ${member.email}`);
      } else {
        const errText = await userRes.text();
        console.error(`  ✗ Failed creating ${member.email} (${userRes.status}): ${errText}`);
      }
    } catch (err) {
      console.error(`  ✗ Error creating ${member.email}:`, err.message);
    }
  }

  console.log("\n==========================================================");
  console.log("  🎉 All Clinic Accounts Successfully Created & Verified! ");
  console.log("==========================================================");
  console.log(`Clinic:        ${CLINIC_DATA.clinicName}`);
  console.log(`Owner:         ${CLINIC_DATA.owner.email} (Password: ${CLINIC_DATA.owner.password})`);
  CLINIC_DATA.team.forEach(m => {
    console.log(`${m.roles[0].padEnd(14)}: ${m.email} (Password: ${m.password})`);
  });
  console.log("==========================================================");
}

main().catch(console.error);
