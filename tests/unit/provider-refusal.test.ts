import {expect,it,vi} from 'vitest';
import {boundedModelFetch,boundedWork,ProviderRefusalError} from '@/server/ai/bounded';
import {createChatProvider} from '@/server/ai/chat-provider';
import {providerRefused} from '@/server/ai/provider-refusal';
it.each([{finish_reason:'content_filter',message:{content:null}},{finish_reason:'stop',message:{refusal:'PRIVATE provider refusal'}}])('honors explicit provider refusal signals',choice=>{
 expect(providerRefused({choices:[choice]})).toBe(true);
 expect(providerRefused({choices:[{finish_reason:'stop',message:{content:'A normal answer'}}]})).toBe(false);
});
it('distinguishes moderation 403 from budget and permission failures without exposing upstream text',async()=>{
 for(const [metadata,blocked] of [[{reasons:['PRIVATE flagged input'],provider_name:'Azure'},true],[{error_type:'refusal'},true],[{budget_limit:2},false],[{},false]] as const){
  const request=boundedModelFetch(async()=>Response.json({error:{message:'PRIVATE upstream text',metadata}},{status:403}));
  const error=await request('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body:'{}'}).catch(e=>e);
  expect(error instanceof ProviderRefusalError).toBe(blocked);expect(error.message).not.toContain('PRIVATE');
 }
});
it('preserves the refusal category through the deadline wrapper',async()=>{
 await expect(boundedWork({signal:new AbortController().signal,deadlineAt:new Date(Date.now()+5000)},5000,async()=>{throw new ProviderRefusalError();})).rejects.toBeInstanceOf(ProviderRefusalError);
});
it('retains a billable refusal receipt and never retries or emits refusal prose',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({model:'openai/gpt-4.1-mini',choices:[{finish_reason:'content_filter',message:{role:'assistant',content:null}}],usage:{cost:.00001,prompt_tokens:20,completion_tokens:0}}));
 const provider=createChatProvider({apiKey:'synthetic-test-key-only',modelId:'openai/gpt-4.1-mini',provider:'azure'},fetcher);
 await expect(provider.generate({question:'Synthetic request',evidence:{runId:crypto.randomUUID(),sources:[],passages:[]}},{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+5000)})).rejects.toBeInstanceOf(ProviderRefusalError);
 expect(provider.usage?.()?.costMicroUsd).toBe(10n);expect(fetcher).toHaveBeenCalledOnce();
});
