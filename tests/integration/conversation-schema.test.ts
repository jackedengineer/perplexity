import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const owner = randomUUID();
const conversation = randomUUID();
beforeAll(async () => {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) await db.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8"));
  await db.query(`INSERT INTO "user" (id,name,email) VALUES ('schema-owner','Owner','schema@example.test')`);
});
afterAll(() => db.close());

it("maps an auth identity to one stable application profile", async () => {
  await db.query("INSERT INTO app_users (id,auth_subject) VALUES ($1,'schema-owner')", [owner]);
  await expect(db.query("INSERT INTO app_users (auth_subject) VALUES ('schema-owner')")).rejects.toThrow(/unique/);
  await expect(db.query("INSERT INTO app_users (auth_subject) VALUES ('missing')")).rejects.toThrow(/foreign key/);
});
it("requires ownership and a unique creation intent per owner", async () => {
  const requestId = randomUUID();
  await db.query(`INSERT INTO conversations (id,user_id,creation_request_id,creation_fingerprint,title)
    VALUES ($1,$2,$3,'fingerprint','A private conversation')`, [conversation, owner, requestId]);
  await expect(db.query(`INSERT INTO conversations (user_id,creation_request_id,creation_fingerprint,title)
    VALUES ($1,$2,'fingerprint','Duplicate')`, [owner, requestId])).rejects.toThrow(/unique/);
  await expect(db.query(`INSERT INTO conversations (user_id,creation_request_id,creation_fingerprint,title)
    VALUES ($1,$2,'fingerprint','Orphan')`, [randomUUID(), randomUUID()])).rejects.toThrow(/foreign key/);
});
it("constrains history sequences, content parts and approval metadata", async () => {
  await db.query(`INSERT INTO messages (conversation_id,role,kind,parts,sequence)
    VALUES ($1,'ASSISTANT','ANSWER','[{"type":"text","text":"private draft"}]',1)`, [conversation]);
  await expect(db.query(`INSERT INTO messages (conversation_id,role,kind,parts,sequence)
    VALUES ($1,'USER','QUESTION','[]',1)`, [conversation])).rejects.toThrow(/unique/);
  await expect(db.query(`INSERT INTO messages (conversation_id,role,kind,parts,sequence)
    VALUES ($1,'USER','QUESTION','[]',0)`, [conversation])).rejects.toThrow(/check/);
  await expect(db.query(`INSERT INTO messages (conversation_id,role,kind,parts,sequence,approved_at)
    VALUES ($1,'ASSISTANT','ANSWER','{}',2,now())`, [conversation])).rejects.toThrow(/check/);
});
it("cascades private records when their auth identity is removed", async () => {
  await db.query(`DELETE FROM "user" WHERE id='schema-owner'`);
  expect((await db.query("SELECT id FROM app_users WHERE id=$1", [owner])).rows).toHaveLength(0);
  expect((await db.query("SELECT id FROM conversations WHERE id=$1", [conversation])).rows).toHaveLength(0);
  expect((await db.query("SELECT id FROM messages WHERE conversation_id=$1", [conversation])).rows).toHaveLength(0);
});
