import {defineConfig} from '@trigger.dev/sdk';
export default defineConfig({project:'proj_nypukdvaijxdpilchkph',dirs:['./trigger'],runtime:'node',maxDuration:120,
 retries:{enabledInDev:false,default:{maxAttempts:1}},build:{external:['pg']}});
