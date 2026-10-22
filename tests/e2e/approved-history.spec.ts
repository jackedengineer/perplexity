import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect,test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import * as schema from "@/db/schema";
import { createNeonFixture } from "../live/admission-fixture";
import { completionSession,prepareCompletion,fakeSafety,knownUsage } from "../helpers/completion";
import { createAnswerCompletion } from "@/server/runs/complete";
// Exercise the real production history surface with internally committed fixture answers.
// T11 will add submission; there is no test-only public endpoint or guard bypass.
test("only committed approved answers survive browser reload and owner checks",async({ page,context,browser },testInfo)=>{
  test.setTimeout(90000);
  const f = createNeonFixture(),secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("Dedicated development auth configuration required");
  const errors: string[] = [];page.on("pageerror",error=>errors.push(error.message));
  const reader = await browser.newContext();
  async function person(title: string) {
    const p = await f.identity();p.request.message.text = "Why do rainbows form?";
    await f.owner.update(schema.conversations).set({ title }).where(eq(schema.conversations.id,p.conversation.id));
    const admitted = await f.admission.admit(p.subject,p.request);if (admitted.kind !== "ADMITTED") throw new Error("Fixture admission failed");
    const identity = { ...p,runId: admitted.run.id,...await completionSession(f.owner,p.subject) };
    await prepareCompletion(f.runtime,identity,f.keys);return identity;
  }
  const cookie = (token: string) => ({ name: "perplex.session_token",value: encodeURIComponent(`${token}.${createHmac("sha256",secret).update(token).digest("base64")}`),domain: "localhost",path: "/",httpOnly: true,sameSite: "Lax" as const });
  try {
    await f.budgets();const owner = await person("Rainbow research");
    const model = { modelId: "test/answer",generate: async()=>({ text: "Water refracts sunlight [S1].",usage: { ...knownUsage,costMicroUsd: 200n } }) };
    const service = createAnswerCompletion(f.runtime,{ answer: model,output: fakeSafety() });
    const result = await service.complete(owner.subject,owner.sessionId,owner.runId,new AbortController().signal);
    expect(result.kind).toBe("COMMITTED");
    await context.addCookies([cookie(owner.token)]);await page.goto(`/search/${owner.conversation.id}`);
    await expect(page.getByText("Water refracts sunlight [S1].",{ exact: true })).toBeVisible();
    await page.reload();await expect(page.getByText("Water refracts sunlight [S1].",{ exact: true })).toBeVisible();
    const history = await context.request.get(`/api/conversations/${owner.conversation.id}/messages`);
    expect(history.status()).toBe(200);expect(await history.text()).not.toMatch(/PRIVATE REASONING|UNREVIEWED_PRIVATE_DRAFT/);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `.artifacts/approved-history-${testInfo.project.name}.png`,fullPage: true });
    const denied = await person("Rejected output fixture");
    const output = { ...fakeSafety(),classify: async()=>({ decision: "BLOCK",categoryCodes: ["FRAUD"],policyVersion: "v1" }) };
    const rejected = createAnswerCompletion(f.runtime,{ answer: { ...model,generate: async()=>({ text: "UNREVIEWED_PRIVATE_DRAFT [S1]",usage: knownUsage }) },output });
    expect((await rejected.complete(denied.subject,denied.sessionId,denied.runId,new AbortController().signal)).kind).toBe("DENIED");
    await reader.addCookies([cookie(denied.token)]);
    const foreign = await reader.request.get(`http://localhost:3000/api/conversations/${owner.conversation.id}/messages`);
    expect(foreign.status()).toBe(404);expect(await foreign.text()).not.toContain("Water refracts");
    const deniedPage = await reader.newPage();await deniedPage.goto(`http://localhost:3000/search/${denied.conversation.id}`);
    await expect(deniedPage.getByRole("heading",{ name: "Rejected output fixture",exact: true })).toBeVisible();
    await expect(deniedPage.getByText("Why do rainbows form?",{ exact: true })).toBeVisible();
    expect(await deniedPage.content()).not.toContain("UNREVIEWED_PRIVATE_DRAFT");
    const deniedHistory = await reader.request.get(`http://localhost:3000/api/conversations/${denied.conversation.id}/messages`);
    expect(await deniedHistory.text()).not.toContain("UNREVIEWED_PRIVATE_DRAFT");
    expect(errors).toEqual([]);
  } finally { await reader.close();await f.close(); }
});
