import {fileURLToPath} from 'node:url';
// Test-only app: renders the real components with controlled public fixtures.
// It has no auth, database, inference or billing integration and is never deployed.
const config={agentRules:false,turbopack:{root:fileURLToPath(new URL('../../..',import.meta.url))}};
export default config;
