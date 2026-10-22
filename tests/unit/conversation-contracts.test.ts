import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createInput, listInput, renameInput, encodeCursor } from "@/server/conversations/contracts";

it("normalizes bounded titles and rejects client ownership or model overrides", () => {
  expect(createInput.parse({ clientRequestId: randomUUID(), title: "  My\n  research  " }).title).toBe("My research");
  for (const field of ["userId", "authSubject", "ownerId", "model", "messages", "skipSafety"]) {
    expect(createInput.safeParse({ clientRequestId: randomUUID(), [field]: "forged" }).success).toBe(false);
  }
  expect(createInput.safeParse({ clientRequestId: "invalid" }).success).toBe(false);
  expect(createInput.safeParse({ clientRequestId: randomUUID(), title: "a".repeat(161) }).success).toBe(false);
  expect(createInput.safeParse({ clientRequestId: randomUUID(), title: "null\0byte" }).success).toBe(false);
});
it("validates pagination cursors and bounds list size", () => {
  const cursor = { updatedAt: "2026-10-22T00:00:00.000Z", id: randomUUID() };
  expect(listInput.parse({ cursor: encodeCursor(cursor) }).cursor).toEqual(cursor);
  for (const input of [{ limit: "10000" }, { limit: "-1" }, { cursor: "invalid" }, { q: "x".repeat(161) }]) {
    expect(listInput.safeParse(input).success).toBe(false);
  }
});
it("requires a revision for metadata mutations", () => {
  expect(renameInput.safeParse({ title: "Rename" }).success).toBe(false);
  expect(renameInput.safeParse({ title: "Rename", expectedRevision: -1 }).success).toBe(false);
  expect(renameInput.parse({ title: "Rename", expectedRevision: 0 }).expectedRevision).toBe(0);
});
