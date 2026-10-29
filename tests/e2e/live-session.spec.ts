import { randomUUID, createHmac } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Opt-in smoke test: an isolated synthetic identity in the configured development DB.
// Never reads a real user's cookie or Google account. No test-only app endpoint exists.
test("authenticated workspace renders, renews, and signs out", async ({ context, page }, testInfo) => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const id = `e2e-${randomUUID()}`;
  const token = randomUUID();
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || !process.env.DATABASE_URL?.includes("neon.tech")) throw new Error("Development Neon credentials required");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await db.query('INSERT INTO "user" (id, name, email, email_verified) VALUES ($1,$2,$3,true)', [id, "Curious Tester", `${id}@example.test`]);
    await db.query(`INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at)
      VALUES ($1,$2,$3,now() + interval '5 days',now() - interval '2 days',now() - interval '2 days')`, [id, token, id]);
    const signature = createHmac("sha256", secret).update(token).digest("base64");
    await context.addCookies([{ name: "perplex.session_token", value: encodeURIComponent(`${token}.${signature}`),
      domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: "What do you want to know?" })).toBeVisible();
    await page.goto('/operations');
    await expect(page.getByRole('heading',{name:'Private operations',exact:true})).toHaveCount(0);
    await expect(page.getByText('Budget and maintenance status',{exact:true})).toHaveCount(0);
    await page.goto('/workspace');
    await expect.poll(async () => (await db.query(
      "SELECT expires_at > now() + interval '6 days' AS renewed FROM session WHERE id=$1", [id],
    )).rows[0]?.renewed).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `.artifacts/workspace-${testInfo.project.name}.png`, fullPage: true });
    if (await page.getByRole("button", { name: "Open navigation" }).isVisible()) await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "Open account menu" }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    expect((await db.query("SELECT id FROM session WHERE user_id=$1", [id])).rows).toHaveLength(0);
    await page.goto('/operations');
    await expect(page.getByRole('heading',{name:'Private operations',exact:true})).toHaveCount(0);
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/sign-in$/);
  } finally {
    await db.query('DELETE FROM "user" WHERE id=$1', [id]);
    await db.end();
  }
});
