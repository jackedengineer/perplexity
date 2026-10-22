import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Real PostgreSQL engine, isolated in memory; no developer data can be modified.
const db = new PGlite();
beforeAll(async () => {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) {
    await db.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8"));
  }
});
afterAll(() => db.close());

describe("auth migration", () => {
  it("rejects sessions with no owning user", async () => {
    await expect(db.query(`INSERT INTO session
      (id, token, user_id, expires_at, updated_at)
      VALUES ('orphan', 'orphan-token', 'missing', now() + interval '1 day', now())`))
      .rejects.toThrow(/foreign key/);
  });
  it("enforces unique email and cascades session revocation on user deletion", async () => {
    await db.query(`INSERT INTO "user" (id, name, email) VALUES ('alice', 'Alice', 'alice@example.test')`);
    await expect(db.query(`INSERT INTO "user" (id, name, email)
      VALUES ('duplicate', 'Alice', 'alice@example.test')`)).rejects.toThrow(/unique/);
    await db.query(`INSERT INTO session (id, token, user_id, expires_at, updated_at)
      VALUES ('alice-session', 'alice-token', 'alice', now() + interval '1 day', now())`);
    await db.query(`DELETE FROM "user" WHERE id = 'alice'`);
    expect((await db.query(`SELECT id FROM session`)).rows).toHaveLength(0);
  });
});
