import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const measurements = [];
try {
  for (const path of ["/", "/sign-in"]) {
    for (let sample = 0; sample < 5; sample++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
      }, { path, sample }));
      await context.close();
    }
  }
  await mkdir(".artifacts", { recursive: true });
  await writeFile(".artifacts/performance.json", JSON.stringify({
    conditions: "Local production build; Chromium 1280x800; fresh cache per navigation; no throttling; five samples per route. Not field Core Web Vitals; INP not measured.",
    measurements,
  }, null, 2));
  for (const path of ["/", "/sign-in"]) {
    const rows = measurements.filter((row) => row.path === path);
    console.log(JSON.stringify({ path, maxLcpMs: Math.max(...rows.map((r) => r.lcpMs)), maxCls: Math.max(...rows.map((r) => r.cls)), maxJsTransferBytes: Math.max(...rows.map((r) => r.jsTransferBytes)) }));
  }
  if (measurements.some((r) => r.lcpMs <= 0 || r.lcpMs > 2500 || r.cls > 0.1 || r.jsTransferBytes > 200_000)) {
    throw new Error("Foundation performance budget exceeded; inspect .artifacts/performance.json");
  }
} finally { await browser.close(); }
