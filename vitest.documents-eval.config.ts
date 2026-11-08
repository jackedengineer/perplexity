import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config";
// Live retrieval evaluation only; never part of the default suite.
export default defineConfig({ ...baseConfig, test: { ...baseConfig.test, include: ["tests/evals/documents.live.test.ts"] } });
