import { readFile } from "node:fs/promises";
import { randomUUID, createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { createAuth } from "@/lib/auth-factory";
import { loadApplicationSession } from "@/lib/application-session";
import { createConversationRepository } from "@/server/conversations/repository";
import { createConversationHttp } from "@/server/conversations/http";

const pg = new PGlite();
const db = drizzle(pg, { schema });
const repository = createConversationRepository(db);
const secret = "conversation-tests-only-secret-with-more-than-32-characters";
const auth = createAuth(db, {
  NODE_ENV: "test", DATABASE_URL: "postgresql://localhost/test", BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: secret, GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "test-only",
});
const events: unknown[] = [];
const dependencies = {
  repository: () => repository,
  origin: () => "http://localhost:3000",
  identity: (request: Request) => loadApplicationSession({
    getSession: (headers) => auth.api.getSession({ headers, query: { disableRefresh: true } }),
    revokeSession: async (token) => { await (await auth.$context).internalAdapter.deleteSession(token); },
  }, request.headers),
  log: (event: unknown) => events.push(event),
};
const http = createConversationHttp(dependencies);
type Operation = Parameters<typeof http.handle>[1];
function request(owner: string | null, operation: Operation, body?: unknown, extra: Record<string, string> = {}, query = "") {
  const token = `${owner}-session`;
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  const method = operation === "create" ? "POST" : operation === "rename" ? "PATCH" : "GET";
  return new Request(`http://localhost:3000/api/conversations${query}`, {
    method, headers: { "content-type": "application/json", origin: "http://localhost:3000",
      ...(owner ? { cookie: `perplex.session_token=${encodeURIComponent(`${token}.${signature}`)}` } : {}), ...extra },
    body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
beforeAll(async () => {
  const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries) await pg.exec(await readFile(`drizzle/${entry.tag}.sql`, "utf8"));
  for (const id of ["alice", "bob", "expired", "absolute", "revoked"]) {
    await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, emailVerified: true });
    if (id !== "revoked") await db.insert(schema.session).values({
      id, userId: id, token: `${id}-session`,
      expiresAt: new Date(Date.now() + (id === "expired" ? -1000 : 86_400_000)),
      createdAt: new Date(Date.now() - (id === "absolute" ? 31 * 86_400_000 : 0)), updatedAt: new Date(),
    });
  }
});
afterAll(() => pg.close());

it("requires valid sessions for every operation", async () => {
  for (const owner of [null, "expired", "absolute", "revoked"]) {
    for (const operation of ["create", "list", "get", "history", "rename"] as const) {
      const response = await http.handle(request(owner, operation, { clientRequestId: randomUUID() }), operation, randomUUID());
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  }
});
it("creates, replays and reloads an owned conversation without exposing ownership internals", async () => {
  const body = { clientRequestId: randomUUID(), title: "PRIVATE TITLE NEVER LOG" };
  const first = await http.handle(request("alice", "create", body), "create");
  expect(first.status).toBe(201);
  const { conversation } = await first.json();
  const replay = await http.handle(request("alice", "create", body), "create");
  expect(replay.status).toBe(200);
  expect((await replay.json()).conversation.id).toBe(conversation.id);
  const own = await http.handle(request("alice", "get"), "get", conversation.id);
  expect(own.status).toBe(200);
  expect(JSON.stringify(await own.json())).not.toMatch(/authSubject|userId|creationFingerprint/u);
  for (const id of [conversation.id, randomUUID()]) {
    for (const operation of ["get", "history", "rename"] as const) {
      const response = await http.handle(request("bob", operation, { title: "Stolen", expectedRevision: 0 }), operation, id);
      expect(response.status).toBe(404);
      expect((await response.json()).error).toEqual({ code: "NOT_FOUND", message: "This conversation is unavailable." });
    }
  }
  expect(JSON.stringify(events)).not.toContain(body.title);
});
it("rejects owner forgery, unsafe origins, malformed JSON, wrong media and oversized bytes", async () => {
  const cases: [unknown, Record<string, string>, number][] = [
    [{ clientRequestId: randomUUID(), userId: "bob" }, {}, 422],
    [{ clientRequestId: randomUUID() }, { origin: "https://evil.example" }, 403],
    [{ clientRequestId: randomUUID() }, { origin: "" }, 403],
    ["{broken", {}, 400],
    ["{}", { "content-type": "text/plain" }, 415],
    [JSON.stringify({ title: "😀".repeat(700) }), { "content-length": "1" }, 413],
  ];
  for (const [body, headers, status] of cases) expect((await http.handle(request("alice", "create", body, headers), "create")).status).toBe(status);
  expect((await http.handle(request("alice", "list", undefined, {}, "?limit=5000"), "list")).status).toBe(422);
});
it("returns safe database-outage errors and request correlation", async () => {
  const failing = createConversationHttp({ ...dependencies, repository: () => { throw new Error("database password=NEVER_EXPOSE"); } });
  const response = await failing.handle(request("alice", "list"), "list");
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("NEVER_EXPOSE");
  expect(response.headers.get("x-request-id")).toMatch(/^[\da-f-]{36}$/u);
  expect(response.headers.get("server-timing")).toMatch(/^conversations;dur=/u);
  expect(JSON.stringify(events)).not.toMatch(/NEVER_EXPOSE|session_token/u);
});
