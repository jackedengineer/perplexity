import { describe, expect, it } from "vitest";
import { isGrounded, isSensitive, mentionsSelf } from "@/server/memory/gate";
import { checkOperations } from "@/server/memory/checks";

describe("whether a message talks about the person asking", () => {
  it("passes first-person messages and skips everything else", () => {
    for (const text of ["I'm a civil engineer in Pune, what's the M25 mix ratio?", "Keep it short, my boss wants numbers", "We moved to Bengaluru", "i live in pune", "I’ve been learning Rust"]) expect(mentionsSelf(text)).toBe(true);
    for (const text of ["What is the GDP of India?", "Compare the US and UK inflation", "Summarize this", "Is it safe?"]) expect(mentionsSelf(text)).toBe(false);
  });
  it("skips long, pasted-looking messages", () => {
    expect(mentionsSelf(`I pasted this: ${"text ".repeat(500)}`)).toBe(false);
  });
});

describe("sensitive memories", () => {
  it("rejects contact details, ID numbers, links and sensitive categories", () => {
    for (const text of ["Email is ana@example.com", "Phone +91 98765 43210", "PAN ABCDE1234F", "Passport A1234567", "Blog at https://ana.dev",
      "Was diagnosed with diabetes", "Is a practising Muslim", "Votes Republican", "Is bisexual", "Earns a salary of 20 LPA", "Lives at 12 MG Street"]) expect(isSensitive(text)).toBe(true);
  });
  it("keeps ordinary facts and preferences", () => {
    for (const text of ["Works as a civil engineer", "Lives in Pune", "Prefers metric units", "Is vegetarian", "Planning a Sedona launch in India", "Works as a doctor", "Uses M25 concrete in 2026 projects"]) expect(isSensitive(text)).toBe(false);
  });
});

describe("memories made of the user's own words", () => {
  it("accepts restated facts and rejects invented ones", () => {
    expect(isGrounded("Works as a civil engineer", "I'm a civil engineer in Pune, what's the M25 mix ratio?")).toBe(true);
    expect(isGrounded("Lives in Pune", "I'm a civil engineer in Pune")).toBe(true);
    expect(isGrounded("Lives in Bengaluru", "I moved to Bengaluru last month")).toBe(true);
    expect(isGrounded("Prefers short answers focused on numbers", "Keep it short, I just need the numbers")).toBe(true);
    expect(isGrounded("Is planning a wedding in Goa", "I'm a civil engineer in Pune")).toBe(false);
    expect(isGrounded("Works as a senior structural engineer at L&T", "I'm an engineer")).toBe(false);
    expect(isGrounded("Lives in", "I live in Pune")).toBe(false);
  });
});

describe("checking proposed operations", () => {
  const message = "I moved to Bengaluru and I'm vegetarian now, forget that I eat fish";
  it("drops each bad operation on its own and keeps the rest", () => {
    const existing = new Set(["pune", "fish"]);
    const { accepted, rejected } = checkOperations([
      { op: "UPDATE", id: "pune", text: "Lives in Bengaluru" },
      { op: "ADD", kind: "PREFERENCE", text: "Is vegetarian" },
      { op: "DELETE", id: "fish" },
      { op: "DELETE", id: "someone-else" },
      { op: "UPDATE", id: "pune", text: "Lives in Bengaluru city" },
      { op: "ADD", kind: "PROFILE", text: "Was diagnosed with anxiety" },
      { op: "ADD", kind: "CONTEXT", text: "Is training for a marathon" },
    ], existing, message);
    expect(accepted).toEqual([{ op: "UPDATE", id: "pune", text: "Lives in Bengaluru" }, { op: "ADD", kind: "PREFERENCE", text: "Is vegetarian" }, { op: "DELETE", id: "fish" }]);
    expect(rejected).toEqual(["UNKNOWN_ID", "REPEATED_ID", "SENSITIVE", "UNGROUNDED"]);
  });
});
