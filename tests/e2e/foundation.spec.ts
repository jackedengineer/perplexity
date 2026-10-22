import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public pages are accessible and fit the viewport", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const path of ["/", "/sign-in"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations).toEqual([]);
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: `.artifacts/sign-in-${testInfo.project.name}.png`, fullPage: true });
});

test("private workspace requires sign-in", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("OAuth failure restores a usable sign-in button", async ({ page }) => {
  await page.route("**/api/auth/sign-in/social", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ message: "upstream unavailable" }),
  }));
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("We couldn’t sign you in. Please try again.");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
});

test("unknown routes show an actionable 404", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page wandered off." })).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
});
