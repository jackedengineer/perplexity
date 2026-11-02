import {readFile} from 'node:fs/promises';

// Fail the build if an identity/config-dependent route is accidentally prerendered.
// Review new public routes explicitly instead of allowing private HTML in assets.
const manifest=JSON.parse(await readFile('.next/prerender-manifest.json','utf8'));
const allowed=new Set(['/','/privacy','/terms','/about','/contact','/refunds','/_not-found','/_global-error']);
// Only the default-disabled reviewer 404 may be prerendered, never its form.
let reviewer404=false;
if(manifest.routes['/reviewer-sign-in']){
 const meta=JSON.parse(await readFile('.next/server/app/reviewer-sign-in.meta','utf8'));
 reviewer404=meta.status===404;
}
const unexpected=Object.keys(manifest.routes).filter(path=>!allowed.has(path)&&!(path==='/reviewer-sign-in'&&reviewer404));
if(unexpected.length||Object.keys(manifest.dynamicRoutes).length)throw new Error('Unexpected prerendered routes in Cloudflare cache');
for(const path of ['/','/privacy','/terms']){
 const route=manifest.routes[path];
 if(!route||route.initialRevalidateSeconds!==false)throw new Error('Read-only public cache requires build-time output without revalidation');
}
console.log('Verified read-only public prerenders; auth/private/API routes are excluded.');
