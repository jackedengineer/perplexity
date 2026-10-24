import {expect,it,vi} from 'vitest';
import {verifyGuestChallenge} from '@/server/auth/challenge';
const env={BETTER_AUTH_URL:'https://perplex.example',TURNSTILE_SECRET_KEY:'test-secret'};
const signal=()=>new AbortController().signal;
it('only permits unconfigured challenge bypass on configured loopback origins',async()=>{
 const fetch=vi.fn();await verifyGuestChallenge(null,{BETTER_AUTH_URL:'http://localhost:3000'},signal(),fetch);expect(fetch).not.toHaveBeenCalled();
 await expect(verifyGuestChallenge(null,{BETTER_AUTH_URL:'https://perplex.example'},signal(),fetch)).rejects.toThrow();
});
it.each([{success:false},{success:true,hostname:'evil.example',action:'guest_trial'},{success:true,hostname:'perplex.example',action:'different'},{success:true}])('rejects invalid, wrong-host and wrong-action receipts: %j',async value=>{
 await expect(verifyGuestChallenge('token',env,signal(),vi.fn().mockResolvedValue(Response.json(value)))).rejects.toThrow();
});
it('verifies on the server without forwarding IP or logging secret material',async()=>{
 const request=vi.fn().mockResolvedValue(Response.json({success:true,hostname:'perplex.example',action:'guest_trial'}));
 await verifyGuestChallenge('token',env,signal(),request);
 expect(request).toHaveBeenCalledOnce();expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({secret:'test-secret',response:'token'});
});
it('rejects missing or oversized tokens before contacting the provider',async()=>{
 const request=vi.fn();for(const token of [null,'x'.repeat(2049)])await expect(verifyGuestChallenge(token,env,signal(),request)).rejects.toThrow();expect(request).not.toHaveBeenCalled();
});
