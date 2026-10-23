import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
// Explicit local-results import only. No provider evaluation is scheduled here.
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{environment:'node',maxWorkers:1,include:['tests/evals/score.manual.ts']}});
