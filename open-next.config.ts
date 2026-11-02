import {defineCloudflareConfig} from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

// Serve only build-time public output without starting the Next server. Dynamic
// auth/private/API routes remain uncached; no R2, KV or database cache is added.
export default defineCloudflareConfig({
 incrementalCache:staticAssetsIncrementalCache,
 enableCacheInterception:true,
});
