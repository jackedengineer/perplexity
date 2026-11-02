import {defineCloudflareConfig} from '@opennextjs/cloudflare';

// The proof uses static public pages and private no-store routes; no R2/ISR service.
export default defineCloudflareConfig({});
