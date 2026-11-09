import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config";
// Live memory extraction evaluation only; never part of the default suite.
export default defineConfig({ ...baseConfig, test: { ...baseConfig.test, include: ["tests/evals/memory.live.test.ts"] } });
