import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { applyOperations, deleteAllMemories, getSettings, listMemories, loadReader, memoryCount, updateSettings } from "@/server/memory/store";
import { createMemoryHttp } from "@/server/memory/http";

const pg = new PGlite(), db = drizzle(pg, { schema });
beforeAll(async () => { const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")); for (const entry of journal.entries) await pg.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8")); });
beforeEach(async () => { await db.delete(schema.user); });
afterAll(() => pg.close());

async function person(options: { guest?: boolean; temporary?: boolean } = {}) {
  const subject = randomUUID();
  await db.insert(schema.user).values({ id: subject, name: "Reader", email: `${subject}@example.test`, isAnonymous: options.guest ?? false });
  const [profile] = await db.insert(schema.appUsers).values({ authSubject: subject }).returning();
  const [conversation] = await db.insert(schema.conversations).values({ userId: profile.id, creationRequestId: randomUUID(), creationFingerprint: "synthetic", title: "Memory", memoryEnabled: !options.temporary }).returning();
  return { subject, userId: profile.id, conversationId: conversation.id };
}
const add = (text: string, kind: "PROFILE" | "PREFERENCE" | "CONTEXT" = "PROFILE") => ({ op: "ADD" as const, kind, text });

describe("memory settings", () => {
  it("starts unpaused with no About you, and saves both lazily", async () => {
    const who = await person();
    expect(await getSettings(db, who.subject)).toEqual({ paused: false, instructions: null });
    expect(await updateSettings(db, who.subject, { instructions: "  Civil engineer. Metric units.  " })).toEqual({ paused: false, instructions: "Civil engineer. Metric units." });
    expect(await updateSettings(db, who.subject, { paused: true })).toEqual({ paused: true, instructions: "Civil engineer. Metric units." });
    expect(await updateSettings(db, who.subject, { instructions: "   " })).toEqual({ paused: true, instructions: null });
  });

  it("refuses guests and unknown people", async () => {
    const guest = await person({ guest: true });
    await expect(getSettings(db, guest.subject)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(deleteAllMemories(db, randomUUID())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("deletes every memory, keeps About you, and is idempotent", async () => {
    const who = await person(), other = await person();
    await updateSettings(db, who.subject, { instructions: "Keep it short" });
    await applyOperations(db, who.userId, [add("Works as a civil engineer"), add("Lives in Pune")], null);
    await applyOperations(db, other.userId, [add("Lives in Delhi")], null);
    expect(await deleteAllMemories(db, who.subject)).toBe(2);
    expect(await deleteAllMemories(db, who.subject)).toBe(0);
    expect(await memoryCount(db, other.userId)).toBe(1);
    expect((await getSettings(db, who.subject)).instructions).toBe("Keep it short");
  });
});

describe("applying memory operations", () => {
  it("adds, updates and deletes only the owner's memories, and skips duplicates", async () => {
    const who = await person(), other = await person();
    await applyOperations(db, other.userId, [add("Lives in Delhi")], null);
    const [foreign] = await listMemories(db, other.userId);
    expect(await applyOperations(db, who.userId, [add("Lives in Pune"), add("  lives   in pune "), add("Prefers metric units", "PREFERENCE")], null)).toBe(2);
    const pune = (await listMemories(db, who.userId)).find(m => m.text === "Lives in Pune")!;
    expect(await applyOperations(db, who.userId, [{ op: "UPDATE", id: pune.id, text: "Lives in Bengaluru" }, { op: "DELETE", id: foreign.id }, { op: "UPDATE", id: foreign.id, text: "Lives in Mumbai" }], null)).toBe(1);
    expect((await listMemories(db, who.userId)).map(m => m.text).sort()).toEqual(["Lives in Bengaluru", "Prefers metric units"]);
    expect((await listMemories(db, other.userId)).map(m => m.text)).toEqual(["Lives in Delhi"]);
    expect(await applyOperations(db, who.userId, [{ op: "UPDATE", id: pune.id, text: "prefers METRIC units" }], null)).toBe(0);
  });

  it("saves nothing while paused", async () => {
    const who = await person();
    await updateSettings(db, who.subject, { paused: true });
    expect(await applyOperations(db, who.userId, [add("Lives in Pune")], null)).toBe(0);
    expect(await memoryCount(db, who.userId)).toBe(0);
  });

  it("keeps at most 50, evicting the oldest ongoing context first, even when two answers finish together", async () => {
    const who = await person();
    await applyOperations(db, who.userId, [add("Planning a Sedona launch", "CONTEXT")], null);
    for (let i = 0; i < 49; i++) await applyOperations(db, who.userId, [add(`Profile fact number ${i}`)], null);
    await Promise.all([applyOperations(db, who.userId, [add("Learning Rust", "CONTEXT")], null), applyOperations(db, who.userId, [add("Prefers tables", "PREFERENCE")], null)]);
    const texts = (await listMemories(db, who.userId)).map(m => m.text);
    expect(texts).toHaveLength(50);
    expect(texts).not.toContain("Planning a Sedona launch");
    // Context always goes first, so which other memory survives depends on which answer finished first.
    expect(texts).toContain("Prefers tables");
  });

  it("keeps memories when the conversation they came from is deleted", async () => {
    const who = await person();
    const [message] = await db.insert(schema.messages).values({ conversationId: who.conversationId, sequence: 1, role: "USER", kind: "QUESTION", parts: [{ type: "text", text: "I live in Pune" }] }).returning();
    await applyOperations(db, who.userId, [add("Lives in Pune")], message.id);
    await db.delete(schema.conversations).where(eq(schema.conversations.id, who.conversationId));
    const [kept] = await db.select().from(schema.memories).where(eq(schema.memories.userId, who.userId));
    expect(kept).toMatchObject({ text: "Lives in Pune", sourceMessageId: null });
  });
});

describe("what an answer may know about the asker", () => {
  it("gives About you, then preferences, profile and context, within 2,000 characters", async () => {
    const who = await person();
    await updateSettings(db, who.subject, { instructions: "Civil engineer" });
    await applyOperations(db, who.userId, [add("Planning a Sedona launch", "CONTEXT"), add("Lives in Pune"), add("Prefers short answers", "PREFERENCE")], null);
    expect(await loadReader(db, who.userId, who.conversationId)).toEqual({ instructions: "Civil engineer", memories: ["Prefers short answers", "Lives in Pune", "Planning a Sedona launch"] });
  });

  it("gives nothing for paused memory, temporary chats, guests or another person's conversation", async () => {
    const who = await person(), temporary = await person({ temporary: true }), guest = await person({ guest: true });
    for (const p of [who, temporary, guest]) await applyOperations(db, p.userId, [add("Lives in Pune")], null);
    expect(await loadReader(db, temporary.userId, temporary.conversationId)).toBeNull();
    expect(await loadReader(db, guest.userId, guest.conversationId)).toBeNull();
    expect(await loadReader(db, who.userId, temporary.conversationId)).toBeNull();
    await updateSettings(db, who.subject, { paused: true });
    expect(await loadReader(db, who.userId, who.conversationId)).toBeNull();
  });
});

describe("memory settings API", () => {
  const origin = "https://perplex.test";
  function api(who: { subject: string } | null, guest = false) {
    const consumeRequest = async () => undefined;
    return createMemoryHttp({ identity: async () => who ? { user: { id: who.subject, isAnonymous: guest }, sessionId: "s" } as never : null, origin: () => origin, consumeRequest,
      backend: () => ({ settings: s => getSettings(db, s), update: (s, p) => updateSettings(db, s, p), deleteAll: s => deleteAllMemories(db, s) }), log: () => undefined });
  }
  const patch = (body: unknown, extra: Record<string, string> = {}) => new Request(`${origin}/api/memory`, { method: "PATCH", headers: { origin, "content-type": "application/json", ...extra }, body: typeof body === "string" ? body : JSON.stringify(body) });

  it("reads, updates and deletes the signed-in person's memory settings", async () => {
    const who = await person(), http = api(who);
    expect(await (await http.read(new Request(`${origin}/api/memory`))).json()).toEqual({ data: { paused: false, instructions: null } });
    const updated = await http.update(patch({ paused: true, instructions: "Metric units" }));
    expect(updated.status).toBe(200);
    expect(updated.headers.get("cache-control")).toBe("private, no-store");
    expect(await updated.json()).toEqual({ data: { paused: true, instructions: "Metric units" } });
    await applyOperations(db, who.userId, [add("Lives in Pune")], null);
    await updateSettings(db, who.subject, { paused: false });
    await applyOperations(db, who.userId, [add("Lives in Pune")], null);
    const removed = await http.deleteAll(new Request(`${origin}/api/memory`, { method: "DELETE", headers: { origin } }));
    expect(await removed.json()).toEqual({ data: { deleted: 1 } });
  });

  it("refuses guests, strangers, foreign origins and malformed changes", async () => {
    const who = await person();
    expect((await api(null).read(new Request(`${origin}/api/memory`))).status).toBe(401);
    expect((await api(who, true).read(new Request(`${origin}/api/memory`))).status).toBe(401);
    expect((await api(who).update(patch({ paused: true }, { origin: "https://evil.test" }))).status).toBe(403);
    expect((await api(who).deleteAll(new Request(`${origin}/api/memory`, { method: "DELETE" }))).status).toBe(403);
    for (const body of [{}, { paused: "yes" }, { instructions: "x".repeat(1001) }, { paused: true, extra: 1 }, "not json"]) {
      expect((await api(who).update(patch(body))).status).toBe(422);
    }
    expect((await api(who).update(new Request(`${origin}/api/memory`, { method: "PATCH", headers: { origin, "content-type": "text/plain" }, body: "{}" }))).status).toBe(422);
    expect(await getSettings(db, who.subject)).toEqual({ paused: false, instructions: null });
  });
});
