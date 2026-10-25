import { describe, expect, it } from "vitest";
import route from "../../ops/retired-deployment-route.json";

describe("retired deployment routing scope", () => {
  const host = new RegExp(route.has[0].value);

  it("matches only the explicitly retired deployment", () => {
    expect(host.test("perplexity-ntsfg4nlo-chiragbhugras-projects.vercel.app")).toBe(true);
    for (const name of [
      "perplexity-gold-alpha.vercel.app",
      "perplexity-git-codex-research-gue-382f59-chiragbhugras-projects.vercel.app",
      "perplexity-6p44sxdfc-chiragbhugras-projects.vercel.app",
      "perplexity-ntsfg4nlo-chiragbhugras-projects.vercel.app.example.com",
      "perplexity-ntsfg4nlo-chiragbhugras-projectsXvercelXapp",
      "localhost",
    ]) expect(host.test(name)).toBe(false);
  });

  it("retires every old path, including callbacks and assets", () => {
    for (const path of ["/", "/sign-in", "/library", "/api/auth/callback/google", "/_next/static/app.js"]) {
      expect(new RegExp(route.src).test(path)).toBe(true);
    }
    expect(route.status).toBe(302);
    expect(route.headers.Location).toBe("https://perplexity-gold-alpha.vercel.app/");
  });

  it("requires removal of stale OAuth code and state", () => {
    for (const key of ["code", "state"]) {
      expect(route.transforms).toContainEqual({ type: "request.query", op: "delete", target: { key } });
    }
  });
});
