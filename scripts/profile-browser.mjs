import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { chromium, expect } from "@playwright/test";
import { identityFixture } from "../tests/e2e/identity-fixture.ts";

// Local production-build diagnostics only: disposable identities, no model calls.
config({ path: ".env.local", quiet: true });
if (process.env.LIVE_NEON_E2E !== "1") throw new Error("Development Neon opt-in required");
const label = process.argv.includes("--before") ? "before" : "after";
const baseURL = "http://localhost:3000";
const browser = await chromium.launch();
const seed = await browser.newContext({ baseURL });
const measurements = [], api = [], interactions = [];
let identity;
await mkdir(".artifacts", { recursive: true });
try {
  identity = await identityFixture(seed);
  const created = await seed.request.post("/api/conversations", {
    headers: { Origin: baseURL }, data: { clientRequestId: randomUUID(), title: "Disposable profile fixture" },
  });
  if (created.status() !== 201) throw new Error("Profile fixture creation failed");
  const id = (await created.json()).conversation.id;
  for (const [operation, path, status] of [
    ["list", "/api/conversations", 200], ["conversation", `/api/conversations/${id}`, 200],
    ["history", `/api/conversations/${id}/messages`, 200], ["unavailable-run", `/api/runs/${randomUUID()}`, 404],
  ]) {
    for (let sample = 0; sample < 5; sample++) {
      const started = performance.now(), response = await seed.request.get(path, { timeout: 10000 });
      await response.body();
      if (response.status() !== status) throw new Error(`Unexpected ${operation} status`);
      api.push({ operation, sample, status, totalMs: Math.round(performance.now() - started), serverTiming: response.headers()["server-timing"] ?? null });
    }
  }
  for (const profile of ["desktop", "mobile-4x"]) {
    for (const [route, path] of [["workspace", "/workspace"], ["library", "/library"], ["empty-search", `/search/${id}`]]) {
      for (let sample = 0; sample < 3; sample++) {
        const context = await browser.newContext({ baseURL, viewport: profile === "desktop" ? { width: 1280, height: 800 } : { width: 390, height: 844 } });
        try {
          await context.addCookies(await seed.cookies());
          const page = await context.newPage(), cdp = await context.newCDPSession(page);
          const errors = [];
          page.on("pageerror", error => errors.push(error.message));
          page.on("console", message => { if (message.type() === "error" || message.type() === "warning") errors.push(message.type()); });
          await cdp.send("Network.enable");
          await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
          if (profile === "mobile-4x") {
            await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
          }
          await page.addInitScript(() => {
            window.__profile = { lcp: 0, cls: 0, longTasks: [], events: [] };
            new PerformanceObserver(list => { for (const e of list.getEntries()) window.__profile.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
            new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__profile.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
            new PerformanceObserver(list => { for (const e of list.getEntries()) window.__profile.longTasks.push({ atMs: e.startTime, durationMs: e.duration }); }).observe({ type: "longtask", buffered: true });
            new PerformanceObserver(list => { for (const e of list.getEntries()) if (e.interactionId) window.__profile.events.push({ name: e.name, durationMs: e.duration, inputDelayMs: e.processingStart - e.startTime }); }).observe({ type: "event", durationThreshold: 16, buffered: true });
          });
          const trace = [], tracing = route === "workspace" && sample === 0;
          if (tracing) {
            cdp.on("Tracing.dataCollected", event => trace.push(...event.value));
            await cdp.send("Tracing.start", { categories: "devtools.timeline,v8.execute,blink.user_timing", transferMode: "ReportEvents" });
          }
          await page.goto(path);
          await expect(page.locator("h1")).toBeVisible();
          // A fixed observation window flushes paint/long-task observers, not a flow assertion.
          await page.waitForTimeout(500);
          const navigation = await page.evaluate(() => {
            const nav = performance.getEntriesByType("navigation")[0];
            return { ttfbMs: Math.round(nav.responseStart - nav.requestStart), lcpMs: Math.round(window.__profile.lcp), cls: window.__profile.cls,
              jsTransferBytes: performance.getEntriesByType("resource").filter(r => r.name.includes(".js")).reduce((n, r) => n + r.transferSize, 0),
              longTaskCount: window.__profile.longTasks.length, longestTaskMs: Math.round(Math.max(0, ...window.__profile.longTasks.map(e => e.durationMs))),
              blockingMs: Math.round(window.__profile.longTasks.reduce((n, e) => n + Math.max(0, e.durationMs - 50), 0)) };
          });
          measurements.push({ profile, route, sample, ...navigation });
          if (route === "workspace") {
            const toggle = page.getByRole("button", { name: profile === "desktop" ? "Expand sidebar" : "Open navigation", exact: true });
            await toggle.click();
            const close = page.getByRole("button", { name: profile === "desktop" ? "Collapse sidebar" : "Close navigation", exact: true });
            await expect(close).toBeVisible(); await close.click();
            await page.getByRole("textbox", { name: "Ask a question" }).pressSequentially("rainbow", { delay: 30 });
            await expect(page.getByRole("button", { name: "Submit question" })).toBeEnabled();
            await page.waitForTimeout(100);
            interactions.push({ profile, sample, events: await page.evaluate(() => window.__profile.events), errors });
          }
          if (tracing) {
            const complete = new Promise((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error("Trace completion timed out")), 10000);
              cdp.once("Tracing.tracingComplete", () => { clearTimeout(timer); resolve(); });
            });
            await cdp.send("Tracing.end"); await complete;
            // Keep timing/thread metadata, omit event args that can contain content or URLs.
            const events = trace.map(({ name, cat, ph, ts, dur, pid, tid, args }) => ({ name, cat, ph, ts, dur, pid, tid, ...(ph === "M" ? { args: { name: args?.name } } : {}) }));
            await writeFile(`.artifacts/devtools-${label}-${profile}.json`, JSON.stringify({ traceEvents: events }));
          }
          if (errors.length) throw new Error("Browser errors detected while profiling");
          console.log(JSON.stringify({ profile, route, sample, ...navigation }));
        } finally { await context.close(); }
      }
    }
  }
  await writeFile(`.artifacts/browser-profile-${label}.json`, JSON.stringify({ conditions: "Local production build; disposable identity; three cold-cache samples per route/profile. Desktop unthrottled; mobile 390x844 with CDP CPU 4x. No network shaping. API probes are unthrottled. Event Timing samples are lab interactions, not field INP. No AI calls.", measurements, api, interactions }, null, 2));
  if (measurements.some(row => row.lcpMs <= 0 || row.lcpMs > 2500 || row.cls > .1 || row.jsTransferBytes > 200000)) throw new Error("Existing navigation performance budget exceeded");
} finally {
  try { await seed.close(); await identity?.cleanup(); } finally { await browser.close(); }
}
