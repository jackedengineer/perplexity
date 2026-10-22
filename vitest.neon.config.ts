import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

config({ path: ".env.local", quiet: true });
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["tests/live/**/*.test.ts"], fileParallelism: false,
    testTimeout: 30_000, hookTimeout: 30_000 },
});
