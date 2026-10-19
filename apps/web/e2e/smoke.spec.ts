import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("http://localhost:3000/");
  await expect(page.getByRole("heading", { name: /sign in|vetos|clinic/i })).toBeVisible({ timeout: 15_000 });
});
