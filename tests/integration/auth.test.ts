import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "@/lib/auth-factory";
import { loadApplicationSession } from "@/lib/application-session";
import * as schema from "@/db/schema";

const pg = new PGlite();
const db = drizzle(pg, { schema });
const secret = "isolated-test-secret-which-is-at-least-32-characters";
const auth = createAuth(db, {
  NODE_ENV: "test", DATABASE_URL: "postgresql://localhost/test",
  BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: secret,
  GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "test-only",
});
beforeAll(async () => {
  await pg.exec(await readFile("drizzle/0000_auth_foundation.sql", "utf8"));
  await db.insert(schema.user).values({ id: "alice", name: "Alice", email: "alice@example.test", emailVerified: true });
});
afterAll(() => pg.close());

async function seedSession(id: string, createdAt = new Date(), expiresAt = new Date(Date.now() + 604_800_000)) {
  await db.insert(schema.session).values({ id, token: id, userId: "alice", createdAt, updatedAt: createdAt, expiresAt });
  const signature = createHmac("sha256", secret).update(id).digest("base64");
  return new Headers({ cookie: `perplex.session_token=${encodeURIComponent(`${id}.${signature}`)}` });
}
const dependencies = {
  getSession: (headers: Headers) => auth.api.getSession({ headers, query: { disableRefresh: true } }),
  revokeSession: async (id: string) => { await (await auth.$context).internalAdapter.deleteSession(id); },
};

describe("database-backed authentication", () => {
  it("returns no application identity without a valid cookie", async () => {
    expect(await loadApplicationSession(dependencies, new Headers())).toBeNull();
    expect(await loadApplicationSession(dependencies, new Headers({ cookie: "perplex.session_token=tampered" }))).toBeNull();
  });
  it("returns only safe identity fields for a valid session", async () => {
    const identity = await loadApplicationSession(dependencies, await seedSession("valid"));
    expect(identity?.user.id).toBe("alice");
    expect(JSON.stringify(identity)).not.toContain('"token"');
  });
  it("rejects expired and revoked sessions", async () => {
    const expired = await seedSession("expired", new Date(Date.now() - 604_800_000), new Date(Date.now() - 1000));
    expect(await loadApplicationSession(dependencies, expired)).toBeNull();
    const revoked = await seedSession("revoked");
    await dependencies.revokeSession("revoked");
    expect(await loadApplicationSession(dependencies, revoked)).toBeNull();
  });
  it("enforces the absolute 30-day cap even after rolling renewal", async () => {
    const headers = await seedSession("absolute", new Date(Date.now() - 30 * 86_400_000));
    expect(await loadApplicationSession(dependencies, headers)).toBeNull();
    expect(await auth.api.getSession({ headers })).toBeNull();
  });
  it("renews an eligible session through a cookie-capable endpoint", async () => {
    const headers = await seedSession("renew", new Date(Date.now() - 2 * 86_400_000), new Date(Date.now() + 5 * 86_400_000));
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/get-session", { headers }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/perplex.session_token=.*HttpOnly/i);
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  });
  it("blocks untrusted origins before OAuth initiation", async () => {
    const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/social", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ provider: "google", callbackURL: "/workspace" }),
    }));
    expect(response.status).toBe(403);
  });
});
