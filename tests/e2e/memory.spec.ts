import { and, eq, sql } from "drizzle-orm";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { identityFixture } from "./identity-fixture";
import { createNeonFixture } from "../live/admission-fixture";
import * as schema from "@/db/schema";

async function provision(f: ReturnType<typeof createNeonFixture>, subject: string) {
  const [profile] = await f.owner.insert(schema.appUsers).values({ authSubject: subject }).returning();
  const window = { startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000) };
  await f.owner.execute(sql`SELECT ensure_free_credits(${profile.id}::uuid)`);
  await f.owner.insert(schema.operatorUsageBuckets).values((["DAY", "PERIOD"] as const).map(kind => ({ budgetKey: process.env.T11_TEST_BUDGET_KEY!, kind, ...window, providerLimitMicroUsd: 1000000n }))).onConflictDoNothing();
  return profile.id;
}
const composer = (page: Page) => page.locator("form.question-composer");
const memoryDialog = (page: Page) => page.getByRole("dialog", { name: "Memory" });
async function ask(page: Page, text: string) {
  await page.getByRole("group", { name: "Conversation mode" }).getByRole("button", { name: "Chat" }).click();
  await page.getByRole("textbox", { name: "Ask a question" }).fill(text);
  await composer(page).getByRole("button", { name: "Submit question" }).click();
  await expect(page.getByText("You have not told me your name in this chat.")).toBeVisible({ timeout: 30000 });
}
async function openMemory(page: Page) {
  await page.getByRole("button", { name: "Open account menu" }).last().click();
  await page.getByRole("dialog", { name: "Your account" }).getByRole("button", { name: "Memory" }).click();
  await expect(memoryDialog(page)).toBeVisible();
}

test("memory learns quietly, and its settings pause, explain and delete it", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop", "The full flow runs on desktop; mobile checks layout below.");
  const identity = await identityFixture(context), f = createNeonFixture();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    const userId = await provision(f, identity.id);
    const saved = () => f.owner.select({ text: schema.memories.text }).from(schema.memories).where(eq(schema.memories.userId, userId));
    await page.goto("/workspace");
    await ask(page, "I'm a civil engineer in Pune, what's the M25 mix ratio?");
    // Saved after the answer, with nothing on screen saying so.
    await expect.poll(async () => (await saved()).map(m => m.text).sort(), { timeout: 20000 }).toEqual(["Lives in Pune", "Works as a civil engineer"]);
    // (The closed account menu holds a "Memory" button, so only the conversation itself is checked.)
    await expect(page.locator("main")).not.toContainText(/memory|remember/iu);

    await openMemory(page);
    const dialog = memoryDialog(page);
    expect((await new AxeBuilder({ page }).include(".memory-dialog").analyze()).violations).toEqual([]);
    // Settings only: what Perplex remembers is never listed.
    await expect(dialog).not.toContainText("Pune");
    const memorySwitch = dialog.getByRole("switch", { name: /Use and save memories/u });
    await expect(memorySwitch).toBeChecked();

    await dialog.getByRole("textbox", { name: /About you/u }).fill("Use metric units and keep answers short.");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Saved About you.");
    await memorySwitch.click();
    await expect(dialog.getByRole("status")).toHaveText("Memory is paused.");
    await expect(memorySwitch).not.toBeChecked();
    const [settings] = await f.owner.select().from(schema.memorySettings).where(eq(schema.memorySettings.userId, userId));
    expect(settings).toMatchObject({ paused: true, instructions: "Use metric units and keep answers short." });
    await memorySwitch.click();
    await expect(memorySwitch).toBeChecked();

    await dialog.getByRole("button", { name: "Delete all memories" }).click();
    await expect(dialog.getByRole("button", { name: "Delete all", exact: true })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog.getByRole("button", { name: "Delete all memories" })).toBeFocused();
    expect(await saved()).toHaveLength(2);
    await dialog.getByRole("button", { name: "Delete all memories" }).click();
    await dialog.getByRole("button", { name: "Delete all", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("Deleted all saved memories.");
    expect(await saved()).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // A temporary chat neither uses nor saves memory, and says so at the top of the thread.
    await page.goto("/workspace");
    const temporary = composer(page).getByRole("button", { name: "Temporary chat" });
    await expect(temporary).toHaveAttribute("aria-pressed", "false");
    await temporary.click();
    await expect(temporary).toHaveAttribute("aria-pressed", "true");
    await ask(page, "I'm a civil engineer in Pune, any suppliers nearby?");
    await expect(page.getByRole("img", { name: /Temporary chat/u })).toBeVisible();
    const id = page.url().split("/search/")[1];
    const [conversation] = await f.owner.select({ memoryEnabled: schema.conversations.memoryEnabled }).from(schema.conversations).where(eq(schema.conversations.id, id));
    expect(conversation.memoryEnabled).toBe(false);
    await page.waitForTimeout(3000);
    expect(await saved()).toEqual([]);
    expect(await f.owner.select().from(schema.memoryExtractions).innerJoin(schema.runs, eq(schema.runs.id, schema.memoryExtractions.runId))
      .where(and(eq(schema.memoryExtractions.userId, userId), eq(schema.runs.conversationId, id)))).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await identity.cleanup();
    await f.owner.delete(schema.operatorUsageBuckets).where(eq(schema.operatorUsageBuckets.budgetKey, process.env.T11_TEST_BUDGET_KEY!));
  }
});

test("memory settings and the temporary toggle fit a phone", async ({ page, context }, info) => {
  test.skip(info.project.name !== "mobile", "Layout check only.");
  const identity = await identityFixture(context), f = createNeonFixture();
  try {
    await provision(f, identity.id);
    await page.goto("/workspace");
    const temporary = composer(page).getByRole("button", { name: "Temporary chat" });
    await expect(temporary).toBeVisible();
    expect((await temporary.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("dialog", { name: "Navigation" }).getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("dialog", { name: "Your account" }).getByRole("button", { name: "Memory" }).click();
    const dialog = memoryDialog(page);
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!, width = page.viewportSize()!.width;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await dialog.getByRole("textbox", { name: /About you/u }).evaluate(el => getComputedStyle(el).fontSize)).toBe("16px");
    await page.screenshot({ path: ".artifacts/memory-dialog-mobile.png" });
  } finally {
    await identity.cleanup();
    await f.owner.delete(schema.operatorUsageBuckets).where(eq(schema.operatorUsageBuckets.budgetKey, process.env.T11_TEST_BUDGET_KEY!));
  }
});
