import {expect,it,vi} from 'vitest';
import {createOpenRouterSafetyProvider} from '@/server/safety/openrouter';
import {boundedModelFetch} from '@/server/ai/bounded';
import {createTavilySearch} from '@/server/search/tavily';
import {createTavilyExtract} from '@/server/search/extract';
import {createRazorpay} from '@/server/payments/razorpay';
import {verifyGuestChallenge} from '@/server/auth/challenge';
const options=()=>({signal:new AbortController().signal,deadlineAt:new Date(Date.now()+10000)});
const cases:Array<[string,(request:typeof fetch)=>Promise<unknown>]>=[
 ['safety',request=>createOpenRouterSafetyProvider({apiKey:'synthetic-key',modelId:'test/classifier',provider:'test'},request).classify({text:'What is photosynthesis?',context:[]},options().signal)],
 ['answer/planner',request=>boundedModelFetch(request)('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:'{}',signal:options().signal})],
 ['search',request=>createTavilySearch('synthetic-key',request).search('Photosynthesis',options())],
 ['extraction',request=>createTavilyExtract('synthetic-key',request).extract(['https://example.org/biology'],options())],
 ['payments',request=>createRazorpay({keyId:'rzp_test_fixture',keySecret:'synthetic-key'},request).plan('plan_fixture')],
 ['Turnstile',request=>verifyGuestChallenge('synthetic-token',{BETTER_AUTH_URL:'https://perplexity.jacked.dev',TURNSTILE_SECRET_KEY:'synthetic-key'},options().signal,request)],
];
it.each(cases)('%s supports the Workers redirect mode and never forwards credentials to a redirect',async(_name,run)=>{
 const request=vi.fn<typeof fetch>(async(_url,init)=>{
  if(init?.redirect==='error')throw new TypeError('Unsupported redirect mode: error');
  return new Response(null,{status:307,headers:{location:'https://attacker.example/collect'}});
 });
 await expect(run(request)).rejects.toThrow();
 expect(request).toHaveBeenCalledOnce();
 expect(request.mock.calls[0][1]?.redirect).toBe('manual');
 expect(String(request.mock.calls[0][0])).not.toContain('attacker');
});
