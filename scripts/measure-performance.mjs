import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { identityFixture } from "../tests/e2e/identity-fixture.ts";
import { chromium } from "@playwright/test";

config({ path: ".env.local", quiet: true });
const privateMode = process.argv.includes("--private");
const browser = await chromium.launch();
const measurements = [];
const apiMeasurements = [];
let identity;
let seedContext;
let paths = ["/", "/sign-in"];
try {
  if (privateMode) {
    seedContext = await browser.newContext({ baseURL: "http://localhost:3000" });
    identity = await identityFixture(seedContext);
    const created = await seedContext.request.post("/api/conversations", { headers: { Origin: "http://localhost:3000" },
      data: { clientRequestId: randomUUID(), title: "Private performance fixture" } });
    if (created.status() !== 201) throw new Error("Private performance fixture unavailable");
    const id = (await created.json()).conversation.id;
    paths = ["/workspace", "/library", `/search/${id}`];
    for (let sample = 0; sample < 5; sample++) {
      for (const endpoint of ["/api/conversations", `/api/conversations/${id}`]) {
        const response = await seedContext.request.get(endpoint);
        if (!response.ok()) throw new Error("Private API probe failed");
        apiMeasurements.push({ operation: endpoint.endsWith(id) ? "get" : "list", sample,
          serverTiming: response.headers()["server-timing"] });
      }
    }
  }
  for (const path of paths) {
    for (let sample = 0; sample < 5; sample++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      if (seedContext) await context.addCookies(await seedContext.cookies());
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__lab = { lcp: 0, cls: 0 };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__lab.lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__lab.cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.goto(`http://localhost:3000${path}`);
      await page.locator("h1").waitFor();
      // Allow paint observers to flush; this is a lab measurement, not a flow assertion.
      await page.waitForTimeout(300);
      measurements.push(await page.evaluate(({ path, sample }) => {
        const nav = performance.getEntriesByType("navigation")[0];
        const resources = performance.getEntriesByType("resource");
        return {
          path, sample, ttfbMs: Math.round(nav.responseStart - nav.requestStart),
          lcpMs: Math.round(window.__lab.lcp), cls: window.__lab.cls,
          jsTransferBytes: resources.filter((r) => r.name.includes(".js")).reduce((sum, r) => sum + r.transferSize, 0),
        };
      }, { path: path.startsWith("/search/") ? "/search/:id" : path, sample }));
      await context.close();
    }
  }
  await mkdir(".artifacts", { recursive: true });
  await writeFile(privateMode ? ".artifacts/private-performance.json" : ".artifacts/performance.json", JSON.stringify({
    conditions: "Local production build; Chromium 1280x800; fresh cache per navigation; no throttling; five samples per route. Not field Core Web Vitals; INP not measured.",
    measurements, apiMeasurements,
  }, null, 2));
  for (const path of [...new Set(measurements.map((row) => row.path))]) {
    const rows = measurements.filter((row) => row.path === path);
    console.log(JSON.stringify({ path, maxTtfbMs: Math.max(...rows.map((r) => r.ttfbMs)), maxLcpMs: Math.max(...rows.map((r) => r.lcpMs)), maxCls: Math.max(...rows.map((r) => r.cls)), maxJsTransferBytes: Math.max(...rows.map((r) => r.jsTransferBytes)) }));
  }
  if (measurements.some((r) => r.lcpMs <= 0 || r.lcpMs > 2500 || r.cls > 0.1 || r.jsTransferBytes > 200_000)) {
    throw new Error("Frontend performance budget exceeded; inspect the mode-specific .artifacts performance report");
  }
} finally {
  try { await seedContext?.close(); await identity?.cleanup(); } finally { await browser.close(); }
}
