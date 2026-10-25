// Read-only, unauthenticated checks. Never submits research or spends AI credits.
import { readFile } from "node:fs/promises";

const route = JSON.parse(await readFile(new URL("../ops/retired-deployment-route.json", import.meta.url), "utf8"));
const retired = "https://perplexity-ntsfg4nlo-chiragbhugras-projects.vercel.app";
const production = "https://perplexity-gold-alpha.vercel.app";
const checks = [
  { url: `${retired}/`, status: 302, location: `${production}/` },
  { url: `${retired}/sign-in`, status: 302, location: `${production}/` },
  { url: `${retired}/library`, status: 302, location: `${production}/` },
  // Synthetic values only: old callback parameters must not reach production.
  { url: `${retired}/api/auth/callback/google?code=synthetic&state=synthetic`, status: 302, location: `${production}/` },
  { url: `${production}/`, status: 200, location: null },
  { url: `${production}/sign-in`, status: 200, location: null, text: "Continue with Google" },
];

if (route.headers.Location !== `${production}/` || route.status !== 302) {
  throw new Error("Review the probe expectations before changing the retired-host destination.");
}

let failed = false;
for (const check of checks) {
  try {
    const response = await fetch(check.url, {
      redirect: "manual", signal: AbortSignal.timeout(15_000),
    });
    const location = response.headers.get("location");
    const bodyMatches = !check.text || (await response.text()).includes(check.text);
    const passed = response.status === check.status && location === check.location && bodyMatches;
    failed ||= !passed;
    // Do not print SSO nonces, cookies, response bodies, or arbitrary redirect URLs.
    const protectedByVercel = location?.startsWith("https://vercel.com/sso-api?");
    console.log(JSON.stringify({
      path: new URL(check.url).pathname,
      host: new URL(check.url).hostname,
      status: response.status,
      passed,
      detail: protectedByVercel ? "Vercel protection runs before project routing" :
        passed ? "Expected public response" : "Unexpected response; inspect manually",
    }));
    await response.body?.cancel().catch(() => {});
  } catch (error) {
    failed = true;
    console.error(JSON.stringify({ path: new URL(check.url).pathname, passed: false,
      detail: error instanceof Error ? error.name : "Request failed" }));
  }
}
process.exitCode = failed ? 1 : 0;
