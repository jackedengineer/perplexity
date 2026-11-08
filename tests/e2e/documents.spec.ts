import { readFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { identityFixture } from "./identity-fixture";
import { createNeonFixture } from "../live/admission-fixture";
import * as schema from "@/db/schema";

// The operator budget is shared per test run, so only the first account creates its buckets.
async function provision(f: ReturnType<typeof createNeonFixture>, subject: string, operator = true) {
  const [profile] = await f.owner.insert(schema.appUsers).values({ authSubject: subject }).returning();
  const window = { startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000) };
  await f.owner.execute(sql`SELECT ensure_free_credits(${profile.id}::uuid)`);
  if (!operator) return [];
  const operators = await f.owner.insert(schema.operatorUsageBuckets).values((["DAY", "PERIOD"] as const).map(kind => ({ budgetKey: process.env.T11_TEST_BUDGET_KEY!, kind, ...window, providerLimitMicroUsd: 1000000n }))).returning({ id: schema.operatorUsageBuckets.id });
  return operators.map(row => row.id);
}
const filesDialog = (page: Page) => page.getByRole("dialog", { name: "Your files" });
const composer = (page: Page) => page.locator("form.question-composer");
const chip = (page: Page, name: string) => composer(page).locator(".attachment-chip", { hasText: name });
// Drops a fixture PDF the way a browser does when a file is dragged in from the desktop.
async function dropPdf(page: Page, file: string) {
  const bytes = (await readFile(file)).toString("base64"), name = file.split("/").at(-1)!;
  await page.evaluate(({ bytes, name }) => {
    const data = new DataTransfer();
    data.items.add(new File([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], name, { type: "application/pdf" }));
    const target = document.querySelector("main") ?? document.body;
    target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: data }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: data }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data }));
  }, { bytes, name });
}

test("files attach to any Chat or Web question by picking, dropping or reusing them", async ({ page, context, browser }, info) => {
  test.skip(info.project.name !== "desktop", "The full flow runs on desktop; mobile checks layout below.");
  const identity = await identityFixture(context), f = createNeonFixture();
  let buckets: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const chats: { text: string; mode: string; documentIds?: string[] }[] = [];
  page.on("request", request => { if (request.url().endsWith("/api/chat")) { const body = request.postDataJSON(); chats.push({ text: body?.message?.text, mode: body?.mode, documentIds: body?.documentIds }); } });
  try {
    buckets = await provision(f, identity.id);
    await page.goto("/workspace");
    // Files is not a mode any more.
    await expect(page.getByRole("group", { name: "Conversation mode" }).getByRole("button")).toHaveText(["Chat", "Web", "Deep ResearchPro"]);

    const attach = composer(page).getByRole("button", { name: "Attach files" });
    await attach.click();
    const menu = page.getByRole("menu", { name: "Attach files" });
    await expect(menu.getByRole("menuitem", { name: /Upload PDFs/u })).toBeFocused();
    expect((await new AxeBuilder({ page }).include(".attach-menu").analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(attach).toBeFocused();

    // Picking a file attaches it; it can't be asked about until it's prepared.
    await page.getByRole("textbox", { name: "Ask a question" }).fill("What was the average turbidity in the third quarter?");
    await composer(page).locator('input[type=file]').setInputFiles("tests/fixtures/documents/water-report.pdf");
    await expect(chip(page, "water-report.pdf")).toContainText("3 pages", { timeout: 30000 });
    await expect(page.getByRole("button", { name: "Submit question" })).toBeEnabled();
    // A scan is refused with the public message and never attached.
    await composer(page).locator('input[type=file]').setInputFiles("tests/fixtures/documents/scanned.pdf");
    await expect(page.locator(".attachment-problems")).toContainText("We couldn’t read text from this PDF.");
    await expect(composer(page).locator(".attachment-chip")).toHaveCount(1);
    // Dropping a PDF anywhere on the page attaches it too, instead of opening it.
    await dropPdf(page, "tests/fixtures/documents/budget-table.pdf");
    await expect(chip(page, "budget-table.pdf")).toContainText("1 page", { timeout: 30000 });
    await page.screenshot({ path: ".artifacts/attachments-composer-desktop.png" });
    // Removing a chip detaches it from the question but keeps the file.
    await chip(page, "budget-table.pdf").getByRole("button", { name: "Remove budget-table.pdf" }).click();
    await expect(composer(page).locator(".attachment-chip")).toHaveCount(1);

    await page.getByRole("button", { name: "Chat", exact: true }).click();
    await expect(page.getByText(/Answers from your file$/u)).toBeVisible();
    await page.getByRole("button", { name: "Submit question" }).click();
    const answer = page.locator(".answer-prose");
    await expect(answer).toContainText("0.37 NTU", { timeout: 60000 });
    const citation = page.locator(".answer-citation").first();
    await expect(citation).toContainText("water-report.pdf · p. 2");
    await expect(page.getByText("Files · Sources used")).toBeVisible();
    // The question shows the file it was asked with, and the follow-up keeps it attached.
    await expect(page.locator(".question-files").getByRole("link", { name: "water-report.pdf" })).toBeVisible();
    await expect(chip(page, "water-report.pdf")).toBeVisible();
    await page.screenshot({ path: ".artifacts/attachments-answer-desktop.png" });
    expect(chats).toHaveLength(1);
    expect(chats[0]).toMatchObject({ text: "What was the average turbidity in the third quarter?", mode: "CHAT" });
    expect(chats[0].documentIds).toHaveLength(1);

    // The citation link redirects to the owner's PDF at that page. Locally the link names the
    // production host, so the same path is requested from the test server.
    const href = await citation.getAttribute("href");
    expect(href).toMatch(/^https:\/\/perplexity\.jacked\.dev\/documents\/[0-9a-f-]{36}\?page=2$/u);
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
      await provision(f, stranger.id, false);
      const listed = await strangerContext.request.get("/api/documents");
      expect((await listed.json()).data).toEqual([]);
      expect((await strangerContext.request.get(new URL(redirect.headers()["location"], local).pathname)).status()).toBe(404);
    } finally { await stranger.cleanup(); await strangerContext.close(); }

    // A Web follow-up sends the same file along with the web search.
    await page.getByRole("button", { name: "Web", exact: true }).click();
    await expect(page.getByText(/Web sources and your file$/u)).toBeVisible();
    await page.getByRole("textbox", { name: "Ask a question" }).fill("Is 0.37 NTU within the limit in this report?");
    await page.getByRole("button", { name: "Submit question" }).click();
    await expect(page.locator(".answer-prose")).toHaveCount(2, { timeout: 60000 });
    expect(chats[1]).toMatchObject({ mode: "FAST", documentIds: chats[0].documentIds });

    // Reattach from the library; deleting a file in Manage files removes its chip.
    await composer(page).getByRole("button", { name: "Attach files" }).click();
    await page.getByRole("menuitemcheckbox", { name: /budget-table\.pdf/u }).click();
    await expect(chip(page, "budget-table.pdf")).toBeVisible();
    await page.keyboard.press("Escape");
    await composer(page).getByRole("button", { name: "Attach files" }).click();
    await page.getByRole("menuitem", { name: "Manage files" }).click();
    await filesDialog(page).getByRole("button", { name: "Delete budget-table.pdf" }).click();
    await filesDialog(page).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(filesDialog(page).locator(".file-row")).toHaveCount(1);
    expect((await new AxeBuilder({ page }).include(".files-dialog").analyze()).violations).toEqual([]);
    await filesDialog(page).getByRole("button", { name: "Close files" }).click();
    await expect(chip(page, "budget-table.pdf")).toHaveCount(0);
    expect(chats).toHaveLength(2);
    expect(errors).toEqual([]);
  } finally {
    await identity.cleanup();
    // Includes the day window the app creates on demand, so the next test starts clean.
    if (buckets.length) await f.owner.delete(schema.operatorUsageBuckets).where(eq(schema.operatorUsageBuckets.budgetKey, process.env.T11_TEST_BUDGET_KEY!));
    await f.close();
  }
});

test("attached files fit a phone screen", async ({ page, context }, info) => {
  test.skip(info.project.name !== "mobile", "Layout check only.");
  const identity = await identityFixture(context), f = createNeonFixture();
  let buckets: string[] = [];
  try {
    buckets = await provision(f, identity.id);
    await page.goto("/workspace");
    // Worst case: an unbroken, very long name with accents and emoji next to a short one.
    const longName = "Q3_Water-Quality_Monitoring_Report_Aurora_Municipal_Utility_District_FINAL_v2_reviewed_ünïcødé_📊_2026-11-08.pdf";
    await composer(page).locator('input[type=file]').setInputFiles([{ name: longName, mimeType: "application/pdf", buffer: await readFile("tests/fixtures/documents/water-report.pdf") }, { name: "budget-table.pdf", mimeType: "application/pdf", buffer: await readFile("tests/fixtures/documents/budget-table.pdf") }]);
    await expect(composer(page).locator(".attachment-chip[data-state=ready]")).toHaveCount(2, { timeout: 30000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const chip of await composer(page).locator(".attachment-chip").all()) { const box = (await chip.boundingBox())!; expect(box.width).toBeLessThanOrEqual(222); }
    const remove = await composer(page).getByRole("button", { name: "Remove budget-table.pdf" }).boundingBox();
    expect(remove!.width).toBeGreaterThanOrEqual(32);
    await page.screenshot({ path: ".artifacts/attachments-composer-mobile.png" });
    await composer(page).getByRole("button", { name: "Attach files" }).click();
    const box = await page.getByRole("menu", { name: "Attach files" }).boundingBox();
    expect(await page.evaluate(() => { const menu = document.querySelector(".attach-menu")!; return menu.scrollWidth <= menu.clientWidth; })).toBe(true);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: ".artifacts/attachments-menu-mobile.png" });
  } finally {
    await identity.cleanup();
    if (buckets.length) await f.owner.delete(schema.operatorUsageBuckets).where(eq(schema.operatorUsageBuckets.budgetKey, process.env.T11_TEST_BUDGET_KEY!));
    await f.close();
  }
});
