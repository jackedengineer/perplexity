import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { identityFixture } from "./identity-fixture";

test("private conversations persist, rename and deny a second user", async ({ browser, context, page }, testInfo) => {
  const owner = await identityFixture(context);
  const otherContext = await browser.newContext({ baseURL: "http://localhost:3000" });
  const other = await identityFixture(otherContext, "Other Reader");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/workspace");
    await expect(page.getByRole("textbox", { name: "Conversation title" })).toBeVisible();
    if (testInfo.project.name === "desktop") {
      const original = page.viewportSize()!;
      await page.setViewportSize({ width: 876, height: 804 });
      const composer = await page.locator("form.research-composer").boundingBox();
      expect(composer?.x).toBeCloseTo(304, 0);
      expect(composer?.y).toBeCloseTo(321.6, 0);
      expect(composer?.width).toBeCloseTo(508, 0);
      expect(composer?.height).toBeCloseTo(120, 0);
      await page.screenshot({ path: ".artifacts/workspace-reference-viewport.png" });
      await page.setViewportSize(original);
    }
    await page.getByRole("textbox", { name: "Conversation title" }).fill("Rainbows and curious questions");
    await page.route("**/api/conversations", (route) => route.fulfill({ status: 503,
      contentType: "application/json", body: JSON.stringify({ error: { message: "Temporary outage" } }) }));
    await page.getByRole("button", { name: "Create conversation", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Conversation title" })).toHaveValue("Rainbows and curious questions");
    await page.unroute("**/api/conversations");
    await page.getByRole("button", { name: "Create conversation", exact: true }).click();
    await expect(page).toHaveURL(/\/search\/[\da-f-]{36}$/u);
    const id = page.url().split("/").at(-1)!;
    await expect(page.getByRole("heading", { name: "Rainbows and curious questions" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Rainbows and curious questions" })).toBeVisible();
    await page.getByRole("button", { name: "Conversation actions" }).click();
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit conversation title" });
    await expect(dialog.getByRole("textbox", { name: "Title", exact: true })).toBeFocused();
    await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("A better research title");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "A better research title" })).toBeVisible();
    const intent = { clientRequestId: randomUUID(), title: "Concurrent intent" };
    const attempts = await Promise.all(Array.from({ length: 4 }, () => context.request.post("/api/conversations", {
      headers: { Origin: "http://localhost:3000" }, data: intent,
    })));
    expect(attempts.map((response) => response.status()).sort()).toEqual([200, 200, 200, 201]);
    expect(new Set(await Promise.all(attempts.map(async (response) => (await response.json()).conversation.id))).size).toBe(1);
    await expect(page.getByRole("button", { name: "Conversation actions" })).toBeFocused();
    for (const method of ["GET", "PATCH"] as const) {
      const response = await otherContext.request.fetch(`/api/conversations/${id}`, {
        method, headers: { Origin: "http://localhost:3000" },
        ...(method === "PATCH" ? { data: { title: "Stolen", expectedRevision: 1 } } : {}),
      });
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain("A better research title");
    }
    const stranger = await otherContext.newPage();
    await stranger.goto(`/search/${id}`);
    await expect(stranger.getByRole("heading", { name: "This conversation is unavailable." })).toBeVisible();
    expect(await stranger.content()).not.toContain("A better research title");
    const admin = new Pool({ connectionString: process.env.DATABASE_URL_DIRECT, max: 1 });
    try {
      await admin.query(`INSERT INTO messages (conversation_id,role,kind,parts,sequence,approved_at,policy_version)
        SELECT $1,'ASSISTANT','ANSWER',jsonb_build_array(jsonb_build_object('type','text','text','Approved answer ' || n)),n,now(),'v1'
        FROM generate_series(1,23) n`, [id]);
      await admin.query(`INSERT INTO messages (conversation_id,role,kind,parts,sequence,approved_at,policy_version)
        VALUES ($1,'ASSISTANT','ANSWER',$2,24,now(),'old-v0')`, [id, JSON.stringify([{ type: "text",text: "STALE_POLICY_MUST_NOT_LEAK" }])]);
      await admin.query(`INSERT INTO messages (conversation_id,role,kind,parts,sequence)
        VALUES ($1,'ASSISTANT','ANSWER',$2,25)`, [id, JSON.stringify([{ type: "text", text: "PRIVATE_DRAFT_MUST_NOT_LEAK" }])]);
    } finally { await admin.end(); }
    await page.reload();
    await expect(page.getByText("Approved answer 23", { exact: true })).toBeVisible();
    await expect(page.getByText("Approved answer 1", { exact: true })).toHaveCount(0);
    await page.route(`**/api/conversations/${id}/messages?*`, (route) => route.fulfill({ status: 503 }));
    await page.getByRole("button", { name: "Load earlier messages" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(/Earlier messages couldn’t load/u);
    await page.unroute(`**/api/conversations/${id}/messages?*`);
    await page.getByRole("button", { name: "Load earlier messages" }).click();
    await expect(page.getByText("Approved answer 1", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Load earlier messages" })).toHaveCount(0);
    expect(await page.locator(".history-message p").allTextContents()).toEqual(Array.from({ length: 23 }, (_, i) => `Approved answer ${i + 1}`));
    expect(await page.content()).not.toMatch(/PRIVATE_DRAFT_MUST_NOT_LEAK|STALE_POLICY_MUST_NOT_LEAK/u);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `.artifacts/conversation-${testInfo.project.name}.png`, fullPage: true });
    if (await page.getByRole("button", { name: "Open navigation" }).isVisible()) await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: "Recents", exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/library/u);
    await page.getByRole("main").getByRole("button", { name: "Search conversations", exact: true }).click();
    await page.getByRole("searchbox", { name: "Search your conversations" }).fill("A better");
    await page.getByRole("searchbox", { name: "Search your conversations" }).press("Enter");
    await expect(page.getByRole("main").getByRole("link", { name: /A better research title/u })).toBeVisible();
    await page.screenshot({ path: `.artifacts/library-${testInfo.project.name}.png`, fullPage: true });
    await page.getByRole("searchbox", { name: "Search your conversations" }).fill("no matches for this title");
    await page.getByRole("searchbox", { name: "Search your conversations" }).press("Enter");
    await expect(page.getByText("No sessions found for “no matches for this title”")).toBeVisible();
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally { await otherContext.close(); await other.cleanup(); await owner.cleanup(); }
});
