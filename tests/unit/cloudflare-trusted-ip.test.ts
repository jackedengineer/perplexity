import {expect,it} from 'vitest';
import {trustedGuestAddress} from '@/server/auth/guest';
import {parseServerEnv} from '@/lib/env-schema';

it('uses only the Cloudflare-overwritten address on a Cloudflare deployment',()=>{
 const env={DEPLOYMENT_PLATFORM:'cloudflare',NODE_ENV:'production',BETTER_AUTH_URL:'https://perplexity.jacked.dev'};
 const request=(headers:Record<string,string>)=>new Request(env.BETTER_AUTH_URL,{headers});
 expect(trustedGuestAddress(request({'cf-connecting-ip':'2001:db8::1','x-forwarded-for':'203.0.113.99'}),env)).toBe('2001:db8::1');
 const untrusted:Record<string,string>[]=[{'x-forwarded-for':'203.0.113.99'},{'x-vercel-forwarded-for':'203.0.113.99'},{'cf-connecting-ip':'203.0.113.1, 203.0.113.2'}];
 for(const headers of untrusted)expect(()=>trustedGuestAddress(request(headers),env)).toThrow();
});
it('preserves Vercel trust and rejects unknown deployment labels',()=>{
 const request=new Request('https://perplexity.jacked.dev', {headers:{'x-vercel-forwarded-for':'203.0.113.7','cf-connecting-ip':'203.0.113.8'}});
 expect(trustedGuestAddress(request,{VERCEL:'1'})).toBe('203.0.113.7');
 const env={DATABASE_URL:'postgresql://localhost/proof',BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:'synthetic-proof-secret'.repeat(2),GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic'};
 expect(parseServerEnv({...env,DEPLOYMENT_PLATFORM:'cloudflare'}).DEPLOYMENT_PLATFORM).toBe('cloudflare');
 expect(()=>parseServerEnv({...env,DEPLOYMENT_PLATFORM:'unknown'})).toThrow();
});
