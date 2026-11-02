import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {promisify} from 'node:util';
import {expect,it} from 'vitest';
const run=promisify(execFile),script=resolve('scripts/verify-cloudflare-static-cache.mjs');
const publicRoutes=()=>Object.fromEntries(['/','/privacy','/terms','/_not-found','/_global-error'].map(path=>[path,{initialRevalidateSeconds:false}]));
async function verify(routes:Record<string,unknown>,dynamicRoutes:Record<string,unknown>={}){
 const cwd=await mkdtemp(join(tmpdir(),'perplex-public-cache-'));
 try{
  await mkdir(join(cwd,'.next'));await writeFile(join(cwd,'.next/prerender-manifest.json'),JSON.stringify({routes,dynamicRoutes}));
  if(routes['/reviewer-sign-in']){await mkdir(join(cwd,'.next/server/app'),{recursive:true});await writeFile(join(cwd,'.next/server/app/reviewer-sign-in.meta'),JSON.stringify({status:(routes['/reviewer-sign-in'] as {initialStatus?:number}).initialStatus??200}));}
  return await run(process.execPath,[script],{cwd});
 }finally{await rm(cwd,{recursive:true,force:true});}
}
it('accepts only immutable public build output',async()=>{
 expect((await verify(publicRoutes())).stdout).toContain('auth/private/API routes are excluded');
});
it.each(['/workspace','/search/private-id','/reviewer-sign-in','/api/auth/get-session','/api/conversations'])('rejects accidentally prerendered private/runtime routes: %s',async path=>{
 await expect(verify({...publicRoutes(),[path]:{initialRevalidateSeconds:false}})).rejects.toThrow('Unexpected prerendered routes');
});
it('permits only a default-disabled reviewer 404, never a cached login form',async()=>{
 expect((await verify({...publicRoutes(),'/reviewer-sign-in':{initialStatus:404,initialRevalidateSeconds:false}})).stdout).toContain('excluded');
});
it('rejects dynamic route prerenders and revalidation that the read-only cache cannot support',async()=>{
 await expect(verify(publicRoutes(),{'/search/[id]':{}})).rejects.toThrow('Unexpected prerendered routes');
 await expect(verify({...publicRoutes(),'/privacy':{initialRevalidateSeconds:60}})).rejects.toThrow('without revalidation');
});
