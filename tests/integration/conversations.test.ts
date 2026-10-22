import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createConversationRepository } from "@/server/conversations/repository";
import { eq } from "drizzle-orm";
import { seedCompletion } from "../helpers/completion";
import { createFinalization } from "@/server/runs/finalize";

const pg = new PGlite();
const db = drizzle(pg, { schema });
const repository = createConversationRepository(db);
const input = (title = "Research notes") => ({ clientRequestId: randomUUID(), title });
beforeAll(async () => {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) await pg.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8"));
  await db.insert(schema.user).values(["alice", "bob"].map((id) => ({ id, name: id, email: `${id}@example.test` })));
});
beforeEach(() => db.delete(schema.appUsers));
afterAll(() => pg.close());

it("creates one UUID profile and replays one owner-scoped intent", async () => {
  const payload = input();
  const first = await repository.create("alice", payload);
  const replay = await repository.create("alice", payload);
  expect(first.created).toBe(true);
  expect(replay.created).toBe(false);
  expect(replay.conversation).toEqual(first.conversation);
  const other = await repository.create("bob", payload);
  expect(other.conversation.id).not.toBe(first.conversation.id);
  expect(await db.select().from(schema.appUsers)).toHaveLength(2);
  await expect(repository.create("alice", { ...payload, title: "Different intent" })).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
});
it("does not disclose foreign conversations or permit foreign renames", async () => {
  const { conversation } = await repository.create("alice", input("Alice's private title"));
  expect((await repository.list("bob", { limit: 20, q: "" })).items).toEqual([]);
  for (const id of [conversation.id, randomUUID()]) {
    await expect(repository.get("bob", id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.history("bob", id, { limit: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.rename("bob", id, { title: "Taken over", expectedRevision: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  expect((await repository.get("alice", conversation.id)).title).toBe("Alice's private title");
});
it("renames with optimistic concurrency while preserving creation replay", async () => {
  const payload = input();
  const { conversation } = await repository.create("alice", payload);
  const updated = await repository.rename("alice", conversation.id, { title: "Renamed", expectedRevision: 0 });
  expect(updated.revision).toBe(1);
  await expect(repository.rename("alice", conversation.id, { title: "Stale", expectedRevision: 0 })).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await repository.create("alice", payload)).conversation.title).toBe("Renamed");
});
it.each(schema.ACTIVE_RUN_STATUSES)("refuses a rename during %s without invalidating settlement", async status => {
  const person=await seedCompletion(db);
  await db.update(schema.runs).set({status}).where(eq(schema.runs.id,person.runId));
  await expect(repository.rename(person.subject,person.conversation.id,{title:"A competing tab",expectedRevision:1})).rejects.toMatchObject({code:"RUN_IN_PROGRESS"});
  expect(await repository.get(person.subject,person.conversation.id)).toMatchObject({title:"Synthetic completion",revision:1});
  await createFinalization(db).fail(person.subject,person.runId,"PROVIDER_UNAVAILABLE",{attemptVersion:1,revision:1});
  expect(await db.select().from(schema.runSettlements).where(eq(schema.runSettlements.runId,person.runId))).toHaveLength(1);
  expect((await db.select().from(schema.usageBuckets).where(eq(schema.usageBuckets.userId,person.profile.id))).map(row=>row.reservedCredits)).toEqual([0,0]);
  expect(await repository.rename(person.subject,person.conversation.id,{title:"After settlement",expectedRevision:1})).toMatchObject({revision:2,title:"After settlement"});
});
it("paginates equal timestamps without leaking owners or interpreting wildcards", async () => {
  for (const title of ["Alpha", "Beta", "100% complete", "under_score"]) await repository.create("alice", input(title));
  await repository.create("bob", input("Bob only"));
  await pg.query("UPDATE conversations SET updated_at=$1", ["2026-10-22T00:00:00.123456Z"]);
  const first = await repository.list("alice", { limit: 2, q: "" });
  const cursor = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString());
  const second = await repository.list("alice", { limit: 2, q: "", cursor });
  expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(4);
  expect(second.nextCursor).toBeNull();
  expect((await repository.list("alice", { limit: 20, q: "%" })).items.map((row) => row.title)).toEqual(["100% complete"]);
  expect((await repository.list("alice", { limit: 20, q: "_" })).items.map((row) => row.title)).toEqual(["under_score"]);
});
it("returns approved history chronologically with bounded older pages", async () => {
  const { conversation } = await repository.create("alice", input());
  await db.insert(schema.messages).values([
    { conversationId: conversation.id, role: "USER", kind: "QUESTION", sequence: 1, parts: [{ type: "text", text: "Question" }] },
    { conversationId: conversation.id, role: "ASSISTANT", kind: "ANSWER", sequence: 2, parts: [{ type: "text", text: "NEVER RELEASE DRAFT" }] },
    { conversationId: conversation.id, role: "ASSISTANT", kind: "ANSWER", sequence: 3, parts: [{ type: "text", text: "Approved answer" }], approvedAt: new Date(), policyVersion: "v1" },
    { conversationId: conversation.id,role: "ASSISTANT",kind: "ANSWER",sequence: 4,parts: [{ type: "text",text: "NEVER RELEASE STALE POLICY" }],approvedAt: new Date(),policyVersion: "old-v0" },
  ]);
  const latest = await repository.history("alice", conversation.id, { limit: 1 });
  expect(latest.items[0].sequence).toBe(3);
  expect(latest.nextBefore).toBe(3);
  const older = await repository.history("alice", conversation.id, { limit: 1, before: latest.nextBefore! });
  expect(older.items.map((message) => message.sequence)).toEqual([1]);
  expect(older.nextBefore).toBeNull();
  expect(JSON.stringify([latest, older])).not.toMatch(/NEVER RELEASE DRAFT|NEVER RELEASE STALE POLICY/u);
  expect(JSON.stringify(latest)).not.toMatch(/userId|creationFingerprint|authSubject/u);
});
