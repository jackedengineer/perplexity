import {expect,it,vi} from 'vitest';
import {MODEL_CATALOG,catalogConfiguration,entitledModel} from '@/server/ai/catalog';
import {answerProviderPolicy} from '@/server/ai/answer-policy';
import {createAnswerProvider} from '@/server/ai/answer';
import {createChatProvider} from '@/server/ai/chat-provider';
import {buildEvidence} from '@/server/search/evidence';
import {EXTENDED_STAGE_LIMITS,EXTENDED_RUN_RESERVE,stageLimits} from '@/server/runs/budgets';
import {submissionSchema} from '@/server/contracts/chat';
const keys=['standard-gemini-flash','standard-qwen-max','standard-qwen-397b'];
it.each(keys)('requires explicit enablement and denies guest access to %s',key=>{
 const entry=entitledModel(key,false),env={OPENROUTER_API_KEY:'synthetic-provider-key'};
 expect(()=>entitledModel(key,true)).toThrow();
 expect(submissionSchema.shape.modelKey.safeParse(key).success).toBe(true);
 expect(catalogConfiguration(key,env)).toBeUndefined();
 const enabled=catalogConfiguration(key,{...env,ENABLED_ANSWER_MODELS:key});
 if(key==='standard-qwen-max')expect(enabled).toBeUndefined();
 else expect(enabled).toMatchObject({modelId:entry.modelId,provider:entry.provider});
});
it('covers the conservative wire/token cost of every larger model without changing old reservations',()=>{
 expect(Object.values(EXTENDED_STAGE_LIMITS).reduce((n,s)=>n+s.capMicroUsd,0n)).toBeLessThanOrEqual(EXTENDED_RUN_RESERVE);
 for(const m of MODEL_CATALOG.filter(m=>keys.includes(m.key))){
  const {max_price:p}=answerProviderPolicy(m.modelId,true);
  expect(BigInt(Math.ceil(20000*p.prompt+m.maxOutputTokens*p.completion))).toBeLessThanOrEqual(EXTENDED_STAGE_LIMITS.ANSWER.capMicroUsd);
 }
 expect(stageLimits(2,'ANSWER')?.capMicroUsd).toBe(12500n);
 expect(stageLimits(1,'ANSWER')?.capMicroUsd).toBe(20000n);
 expect(stageLimits(99,'ANSWER')).toBeUndefined();
});
it.each(keys)('pins the %s wire request with bounded output, no retries or fallback providers',async key=>{
 const m=entitledModel(key,false),evidence=buildEvidence(crypto.randomUUID(),[{title:'Authored fixture',url:'https://example.org/rainbows',content:'Water droplets refract sunlight.',score:.99}],new Date());
 for(const create of [createAnswerProvider,createChatProvider]){
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(Response.json({error:{message:'synthetic denial'}},{status:400}));
  await expect(create({apiKey:'synthetic-provider-key',modelId:m.modelId,provider:m.provider},fetcher,m.maxOutputTokens,12000,true).generate({question:'Why do rainbows form?',evidence:create===createChatProvider?buildEvidence(crypto.randomUUID(),[],new Date()):evidence},{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+45000)})).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledOnce();
  const wire=String(fetcher.mock.calls[0][1]?.body),body=JSON.parse(wire);
  expect(Buffer.byteLength(wire)).toBeLessThanOrEqual(20000);
  expect(body).toMatchObject({model:m.modelId,max_tokens:1200,provider:{only:[m.provider],allow_fallbacks:false,require_parameters:true,data_collection:'deny',zdr:true,max_price:answerProviderPolicy(m.modelId,true).max_price},plugins:[],reasoning:answerProviderPolicy(m.modelId,true).reasoning});
  expect(body.response_format.type).toBe('json_schema');
  if(key==='standard-qwen-397b')expect(body.reasoning).not.toHaveProperty('effort');
 }
});

it('does not silently raise legacy or Deep Research stage prices for a newer model ID',()=>{
 for(const key of keys)expect(answerProviderPolicy(entitledModel(key,false).modelId).max_price).toEqual({prompt:.5,completion:2,request:0});
});
