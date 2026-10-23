import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
if(process.env.LIVE_PLANNING_EVAL!=='1')throw Error('Explicit spending-capped planning evaluation opt-in required');
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{environment:'node',maxWorkers:1,include:['tests/live/planning-provider.test.ts'],testTimeout:600000}});
