import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { submissionSchema } from "@/server/contracts/chat";
import { createPublicError, publicErrorSchema } from "@/server/contracts/errors";

const submission = {
  conversationId: randomUUID(), clientRequestId: randomUUID(), expectedRevision: 0,
  message: { text: "  Explain RAG\nwithout changing my original question.  " },
  mode: "FAST", modelKey: "fast-default",
};

it("preserves original multilingual text and accepts validated locale/timezone hints", () => {
  expect(submissionSchema.parse(submission)).toEqual(submission);
  const text = "इंद्रधनुष कैसे बनता है? 🌈\nKeep this line too.";
  expect(submissionSchema.parse({ ...submission, message: { text }, locale: "hi-IN", timezone: "Asia/Kolkata" }).message.text).toBe(text);
  expect(submissionSchema.parse({ ...submission, message: { text: "🌈".repeat(4000) } }).message.text).toBe("🌈".repeat(4000));
});

it("rejects client authority at every submission level", () => {
  for (const field of ["userId", "messages", "system", "policyVersion", "skipSafety", "isSafe", "budget", "provider", "tools"]) {
    expect(submissionSchema.safeParse({ ...submission, [field]: "forged" }).success, field).toBe(false);
  }
  for (const field of ["role", "id", "approvedAt", "parts"]) {
    expect(submissionSchema.safeParse({ ...submission, message: { text: "Question", [field]: "forged" } }).success, field).toBe(false);
  }
  for (const override of [{ mode: "RESEARCH" }, { modelKey: "google/gemini-flash" }, { expectedRevision: "0" }, { expectedRevision: -1 }, { expectedRevision: 2_147_483_647 }]) {
    expect(submissionSchema.safeParse({ ...submission, ...override }).success).toBe(false);
  }
});

it("rejects malformed IDs, text, locales and non-IANA timezone offsets", () => {
  for (const text of ["", " \n\t", "x".repeat(4001), "🌈".repeat(4001), "null\0byte", "lone\ud800surrogate"]) {
    expect(submissionSchema.safeParse({ ...submission, message: { text } }).success).toBe(false);
  }
  for (const override of [{ conversationId: "not-a-uuid" }, { clientRequestId: "" }, { locale: "en_US" }, { locale: "en-US,hi" }, { timezone: "Mars/Olympus" }, { timezone: "+05:30" }]) {
    expect(submissionSchema.safeParse({ ...submission, ...override }).success).toBe(false);
  }
});

it("constructs correlated fixed errors without accepting model or exception prose", () => {
  const requestId = randomUUID();
  const result = createPublicError("SAFETY_UNAVAILABLE", requestId);
  expect(result.status).toBe(503);
  expect(publicErrorSchema.parse(result.body)).toEqual(result.body);
  expect(publicErrorSchema.safeParse({ ...result.body, error: { ...result.body.error, message: "raw provider secret" } }).success).toBe(false);
  expect(publicErrorSchema.safeParse({ ...result.body, stack: "private stack" }).success).toBe(false);
  for (const code of ["UNKNOWN", "__proto__", "constructor", null, 500]) {
    expect(publicErrorSchema.safeParse({ requestId, error: { code, message: "raw provider secret" } }).success).toBe(false);
  }
  expect(() => createPublicError("INVALID_INPUT", "uncorrelated")).toThrow();
});
