import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Each PGlite file boots a WASM Postgres; bound CPU/memory rather than weakening hook deadlines.
  test: { maxWorkers: 2,environment: "node", include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"] },
});
