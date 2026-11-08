import { eq, sql } from "drizzle-orm";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { identityFixture } from "./identity-fixture";
import { createNeonFixture } from "../live/admission-fixture";
import * as schema from "@/db/schema";

async function provision(f: ReturnType<typeof createNeonFixture>, subject: string) {
  const [profile] = await f.owner.insert(schema.appUsers).values({ authSubject: subject }).returning();
  const window = { startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000) };
  await f.owner.execute(sql`SELECT ensure_free_credits(${profile.id}::uuid)`);
  const operators = await f.owner.insert(schema.operatorUsageBuckets).values((["DAY", "PERIOD"] as const).map(kind => ({ budgetKey: process.env.T11_TEST_BUDGET_KEY!, kind, ...window, providerLimitMicroUsd: 1000000n }))).returning({ id: schema.operatorUsageBuckets.id });
  return operators.map(row => row.id);
}
const filesDialog = (page: Page) => page.getByRole("dialog", { name: "Your files" });

test("a signed-in user uploads a PDF, asks about it and opens the cited page", async ({ page, context, browser }, info) => {
  test.skip(info.project.name !== "desktop", "The full flow runs on desktop; mobile checks layout below.");
  const identity = await identityFixture(context), f = createNeonFixture();
  let buckets: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const chats: string[] = [];
  page.on("request", request => { if (request.url().endsWith("/api/chat")) chats.push(String(request.postDataJSON()?.message?.text ?? request.postDataJSON()?.messages?.at?.(-1)?.parts?.[0]?.text)); });
  try {
    buckets = await provision(f, identity.id);
    await page.goto("/workspace");
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(page.getByRole("button", { name: "Files", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Upload a PDF to ask questions about it.")).toBeVisible();
    await page.getByRole("textbox", { name: "Ask a question" }).fill("What was the average turbidity?");
    await expect(page.getByRole("button", { name: "Submit question" })).toBeDisabled();

    await page.getByRole("button", { name: "Add files" }).click();
    const dialog = filesDialog(page);
    await expect(dialog.getByText("No files yet. Upload a PDF to ask questions about it.")).toBeVisible();
    await dialog.locator("#files-input").setInputFiles("tests/fixtures/documents/water-report.pdf");
    await expect(dialog.getByRole("link", { name: "water-report.pdf" })).toBeVisible({ timeout: 30000 });
    await expect(dialog.getByText(/3 pages · \d+ KB/u)).toBeVisible();
    await expect(dialog.getByText(/Up to 20 PDFs, 10 MB and 300 pages each/u)).toBeVisible();
    // A scan is refused with the public message, and nothing is stored for it.
    await dialog.locator("#files-input").setInputFiles("tests/fixtures/documents/scanned.pdf");
    await expect(dialog.getByRole("alert")).toContainText("We couldn’t read text from this PDF.");
    await expect(dialog.locator(".file-row")).toHaveCount(1);
    expect((await new AxeBuilder({ page }).include(".files-dialog").analyze()).violations).toEqual([]);
    await page.screenshot({ path: ".artifacts/documents-dialog-desktop.png" });
    await dialog.getByRole("button", { name: "Close files" }).click();

    await expect(page.getByRole("button", { name: "1 file" })).toBeVisible();
    await expect(page.getByText(/Answers from your files/u)).toBeVisible();
    await page.getByRole("textbox", { name: "Ask a question" }).fill("What was the average turbidity in the third quarter?");
    await expect(page.getByRole("textbox", { name: "Ask a question" })).toHaveValue("What was the average turbidity in the third quarter?");
    await page.getByRole("button", { name: "Submit question" }).click();
    await expect(page.getByText("What was the average turbidity in the third quarter?", { exact: true }).first()).toBeVisible({ timeout: 30000 });
    const answer = page.locator(".answer-prose");
    await expect(answer).toContainText("0.37 NTU", { timeout: 60000 });
    const citation = page.locator(".answer-citation").first();
    await expect(citation).toContainText("water-report.pdf · p. 2");
    await expect(page.getByText("Files · Sources used")).toBeVisible();
    const href = await citation.getAttribute("href");
    expect(href).toMatch(/^https:\/\/perplexity\.jacked\.dev\/documents\/[0-9a-f-]{36}\?page=2$/u);
    await page.screenshot({ path: ".artifacts/documents-answer-desktop.png" });
    // Closing the files dialog must never submit the draft question.
    expect(chats).toEqual(["What was the average turbidity in the third quarter?"]);

    // The citation link redirects to the owner's PDF at that page. Locally the link names the
    // production host, so the same path is requested from the test server.
    const local = new URL(href!.replace("https://perplexity.jacked.dev", "http://localhost:3001"));
    const redirect = await context.request.get(local.toString(), { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()["location"]).toMatch(/\/api\/documents\/[0-9a-f-]{36}\/file#page=2$/u);
    const file = await context.request.get(new URL(redirect.headers()["location"], local).toString());
    expect(file.headers()["content-type"]).toBe("application/pdf");

    // Another account sees neither the file list nor the file.
    const strangerContext = await browser.newContext({ baseURL: "http://localhost:3001" });
    const stranger = await identityFixture(strangerContext, "Other reader");
    try {
      await provision(f, stranger.id);
      const listed = await strangerContext.request.get("/api/documents");
      expect((await listed.json()).data).toEqual([]);
      expect((await strangerContext.request.get(new URL(redirect.headers()["location"], local).pathname)).status()).toBe(404);
    } finally { await stranger.cleanup(); await strangerContext.close(); }

    await page.getByRole("button", { name: "1 file" }).click();
    await filesDialog(page).getByRole("button", { name: "Delete water-report.pdf" }).click();
    await filesDialog(page).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(filesDialog(page).getByText("No files yet.", { exact: false })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await identity.cleanup();
    // Includes the day window the app creates on demand, so the next test starts clean.
    if (buckets.length) await f.owner.delete(schema.operatorUsageBuckets).where(eq(schema.operatorUsageBuckets.budgetKey, process.env.T11_TEST_BUDGET_KEY!));
    await f.close();
  }
});

test("the files dialog fits a phone screen", async ({ page, context }, info) => {
  test.skip(info.project.name !== "mobile", "Layout check only.");
  const identity = await identityFixture(context), f = createNeonFixture();
  let buckets: string[] = [];
  try {
    buckets = await provision(f, identity.id);
    await page.goto("/workspace");
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await page.getByRole("button", { name: "Add files" }).click();
    await filesDialog(page).locator("#files-input").setInputFiles("tests/fixtures/documents/budget-table.pdf");
    await expect(filesDialog(page).getByRole("link", { name: "budget-table.pdf" })).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: ".artifacts/documents-dialog-mobile.png" });
  } finally {
    await identity.cleanup();
    // Includes the day window the app creates on demand, so the next test starts clean.
    if (buckets.length) await f.owner.delete(schema.operatorUsageBuckets).where(eq(schema.operatorUsageBuckets.budgetKey, process.env.T11_TEST_BUDGET_KEY!));
    await f.close();
  }
});
