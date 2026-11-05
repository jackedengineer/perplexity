import{randomUUID}from'node:crypto';
import{afterEach,expect,it,vi}from'vitest';
import{createPlannerProvider}from'@/server/ai/planner-provider';
import{parsePlannerModel}from'@/server/ai/models';
import{PlanningError,type PlannerInput}from'@/server/ai/plan';
import{STAGE_LIMITS}from'@/server/runs/budgets';
afterEach(()=>vi.useRealTimers());
const input=():PlannerInput=>({original:{id:randomUUID(),text:'Research photosynthesis'},context:[],now:'2026-10-23T09:00:00.000Z',timezone:'Asia/Kolkata',locale:null});
const plan={action:'ANSWER',standaloneQuestion:'Research photosynthesis',intent:'EXPLAIN',explicitConstraints:[],disclosedAssumptions:[],retrieval:{required:true,queries:['photosynthesis explanation'],freshness:'ANY',startDate:null,endDate:null},answerLanguage:'en'};
const config={apiKey:'synthetic-provider-key',modelId:'mistralai/mistral-small-3.2-24b-instruct',provider:'deepinfra/fp8'};
const options=()=>({signal:new AbortController().signal,deadlineAt:new Date(Date.now()+45000)});
const response=(value:unknown={plan},finish_reason='stop')=>Response.json({id:'test-planner',model:config.modelId,created:1,choices:[{index:0,finish_reason,message:{role:'assistant',content:JSON.stringify(value)}}],usage:{prompt_tokens:200,completion_tokens:60,total_tokens:260,cost:.000027}});
it('requires explicit planner assignment without using the answer or safety role as a hidden default',()=>{
 expect(parsePlannerModel({OPENROUTER_API_KEY:config.apiKey,MODEL_PLANNER:config.modelId,PLANNER_OPENROUTER_PROVIDER:config.provider})).toEqual(config);
 expect(parsePlannerModel({OPENROUTER_API_KEY:config.apiKey,MODEL_SAFETY:config.modelId,SAFETY_OPENROUTER_PROVIDER:config.provider})).toBeUndefined();
});
it('uses one schema-bound non-reasoning call with strict privacy, tool, retry and price controls',async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response()),provider=createPlannerProvider(config,fetcher);
 expect((await provider.plan(input(),options())).plan).toEqual(plan);
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));
 expect(body).toMatchObject({model:config.modelId,max_tokens:1024,temperature:0,provider:{only:['deepinfra/fp8'],allow_fallbacks:false,require_parameters:true,data_collection:'deny',zdr:true,max_price:{prompt:.075,completion:.2,request:0}},response_format:{type:'json_schema',json_schema:{strict:true}}});
 expect(body).not.toHaveProperty('reasoning');expect(fetcher).toHaveBeenCalledOnce();
 expect(provider.usage?.()?.costMicroUsd).toBe(27n);
});
it('rejects invented scope and preserves a billed receipt before SDK or plan validation rejects it',async()=>{
 for(const value of [{plan:{...plan,standaloneQuestion:'Explain photosynthesis using python'}},{plan:{action:'IGNORE'}}]){
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response(value)),provider=createPlannerProvider(config,fetcher);
  await expect(provider.plan(input(),options())).rejects.toThrow('Planning unavailable');
  expect(provider.usage?.()?.costMicroUsd).toBe(27n);expect(fetcher).toHaveBeenCalledOnce();
 }
});
it('does not dispatch expired, cancelled or oversized planning inputs and does not retry provider errors',async()=>{
 const fetcher=vi.fn<typeof fetch>(),provider=createPlannerProvider(config,fetcher),controller=new AbortController();controller.abort();
 await expect(provider.plan(input(),{...options(),signal:controller.signal})).rejects.toThrow('Planning unavailable');
 await expect(provider.plan(input(),{...options(),deadlineAt:new Date(0)})).rejects.toThrow('Planning unavailable');
 const value=input();value.context=Array.from({length:6},()=>({id:randomUUID(),role:'USER',text:'x'.repeat(4000)}));
 await expect(provider.plan(value,options())).rejects.toThrow('Planning unavailable');expect(fetcher).not.toHaveBeenCalled();
 fetcher.mockResolvedValue(new Response('PRIVATE_UPSTREAM_ERROR',{status:503}));
 await expect(provider.plan(input(),options())).rejects.toThrow('Planning unavailable');expect(fetcher).toHaveBeenCalledOnce();
});
it('resolves one exact user-topic pricing reference locally, with no paid call or assistant-fact reuse',async()=>{
 const fetcher=vi.fn<typeof fetch>(),provider=createPlannerProvider(config,fetcher),i=input();i.original.text='What about its pricing?';i.context=[{id:randomUUID(),role:'USER',text:'Explain Neon'}];
 expect(await provider.plan(i,options())).toMatchObject({plan:{action:'ANSWER',standaloneQuestion:'What about Neon pricing?'},usage:{costMicroUsd:0n},engine:'CONTEXT_RULE'});expect(fetcher).not.toHaveBeenCalled();
 i.context.push({id:randomUUID(),role:'USER',text:'Explain Supabase'});fetcher.mockResolvedValue(response({plan:{action:'CLARIFY',question:'Which product do you mean?',reasonCode:'AMBIGUOUS_REFERENCE'}}));
 expect((await provider.plan(i,options())).plan.action).toBe('CLARIFY');expect(fetcher).not.toHaveBeenCalled();
});
it('creates one neutral clarification for exact unresolved references without a paid planning attempt',async()=>{
 const fetcher=vi.fn<typeof fetch>(),provider=createPlannerProvider(config,fetcher);
 for(const text of ['Is it better?','Compare them','What about its pricing?','Which one should I use?','Is that current?']){const i=input();i.original.text=text;expect(await provider.plan(i,options())).toMatchObject({plan:{action:'CLARIFY'},usage:{costMicroUsd:0n},engine:'CONTEXT_RULE'});}
 expect(fetcher).not.toHaveBeenCalled();
});
it('fits a maximum multibyte original plus selected history inside the unchanged planner cost cap',async()=>{
 const {preparePlanningInput,PLANNER_LIMITS}=await import('@/server/ai/plan');
 const i=input();i.original.text='🌈'.repeat(3900);i.context=Array.from({length:6},()=>({id:randomUUID(),role:'USER',text:'履歴'.repeat(250)}));
 const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response({plan:{action:'CLARIFY',question:'Which topic do you mean?',reasonCode:'MISSING_ENTITY'}}));
 await createPlannerProvider(config,fetcher).plan(preparePlanningInput(i),options());
 const bytes=Buffer.byteLength(String(fetcher.mock.calls[0][1]?.body),'utf8');
 expect(bytes).toBeLessThanOrEqual(PLANNER_LIMITS.wireBytes);
 expect(Math.ceil(PLANNER_LIMITS.wireBytes*.075+1024*.2)).toBeLessThanOrEqual(2000);
});

it('plans short standalone questions locally before any paid call or timeout',async()=>{
 const fetcher=vi.fn<typeof fetch>();
 for(const text of ['What causes a rainbow? Give a short explanation with reliable sources.','What is a rainbow?','Explain electric current','Compare Neon and Supabase']){
  const i=input();i.original.text=text;
  expect(await createPlannerProvider(config,fetcher).plan(i,options())).toMatchObject({plan:{action:'ANSWER',standaloneQuestion:text,retrieval:{queries:[text]}},engine:'CONTEXT_RULE',usage:{costMicroUsd:0n}});
 }
 expect(fetcher).not.toHaveBeenCalled();
});

const failure=async(fetcher:typeof fetch,signal?:AbortSignal)=>{
 const error=await createPlannerProvider(config,fetcher).plan(input(),{...options(),...(signal?{signal}:{})}).catch(e=>e);
 expect(error).toBeInstanceOf(PlanningError);expect(error.message).toBe('Planning unavailable');return error as PlanningError;
};
it('reports why planning failed using only fixed reason codes',async()=>{
 const reply=(value:unknown,finish?:string)=>vi.fn<typeof fetch>().mockResolvedValue(response(value,finish));
 expect(await failure(reply({plan:{...plan,standaloneQuestion:'Explain photosynthesis using python'}}))).toMatchObject({reason:'PLAN_VOCABULARY'});
 expect(await failure(reply({plan:{...plan,standaloneQuestion:'Research plants'}}))).toMatchObject({reason:'PLAN_VOCABULARY'});
 expect(await failure(reply({plan:{...plan,answerLanguage:'fr'}}))).toMatchObject({reason:'PLAN_LOCALE'});
 expect(await failure(reply({plan:{action:'IGNORE'}}))).toMatchObject({reason:'OUTPUT_UNPARSEABLE'});
 expect(await failure(reply({plan},'length'))).toMatchObject({reason:'FINISH_REASON'});
});
it('names the upstream HTTP status, a moderation refusal and a transport failure without their bodies',async()=>{
 for(const status of [401,402,429,503]){
  const error=await failure(vi.fn<typeof fetch>().mockResolvedValue(new Response('PRIVATE_UPSTREAM_ERROR',{status})));
  expect(error).toMatchObject({reason:'HTTP_ERROR',httpStatus:status});expect(JSON.stringify({...error,message:error.message})).not.toContain('PRIVATE');
 }
 const refused=new Response(JSON.stringify({error:{code:403,message:'PRIVATE',metadata:{reasons:['violence'],provider_name:'test',flagged_input:'PRIVATE'}}}),{status:403,headers:{'content-type':'application/json'}});
 expect(await failure(vi.fn<typeof fetch>().mockResolvedValue(refused))).toMatchObject({reason:'PROVIDER_REFUSED'});
 expect(await failure(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('PRIVATE network failure')))).toMatchObject({reason:'TRANSPORT'});
 expect(await failure(vi.fn<typeof fetch>().mockResolvedValue(response({plan},'content_filter')))).toMatchObject({reason:'PROVIDER_REFUSED'});
});
it('allows a slow plan up to the planner stage limit and reports expiry as a timeout',async()=>{
 vi.useFakeTimers();
 const hanging=vi.fn<typeof fetch>().mockImplementation((_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('PRIVATE','AbortError')),{once:true})));
 let settled=false;const pending=failure(hanging).finally(()=>{settled=true;});
 await vi.advanceTimersByTimeAsync(STAGE_LIMITS.PLANNER.maxDurationMs-1);expect(settled).toBe(false);
 await vi.advanceTimersByTimeAsync(1);expect(await pending).toMatchObject({reason:'TIMEOUT'});expect(STAGE_LIMITS.PLANNER.maxDurationMs).toBe(8000);
});
it('reports caller cancellation during a call as a timeout, not a provider fault',async()=>{
 const controller=new AbortController();
 const pending=failure(vi.fn<typeof fetch>().mockImplementation((_url,init)=>new Promise((_resolve,reject)=>{controller.abort();init?.signal?.addEventListener('abort',()=>reject(new DOMException('PRIVATE','AbortError')),{once:true});if(init?.signal?.aborted)reject(new DOMException('PRIVATE','AbortError'));})),controller.signal);
 expect(await pending).toMatchObject({reason:'TIMEOUT'});
});
const envelope=(content:string)=>Response.json({id:'test-planner',model:config.modelId,created:1,choices:[{index:0,finish_reason:'stop',message:{role:'assistant',content}}],usage:{prompt_tokens:200,completion_tokens:60,total_tokens:260,cost:.00005}});
it('tells a model that answered in prose apart from one that produced malformed JSON',async()=>{
 const prose=createPlannerProvider(config,vi.fn<typeof fetch>().mockResolvedValue(envelope("I can't help with that request.")));
 expect(await prose.plan(input(),options()).catch(e=>e)).toMatchObject({reason:'OUTPUT_NOT_JSON'});expect(prose.usage?.()?.costMicroUsd).toBe(50n);
 expect(await failure(vi.fn<typeof fetch>().mockResolvedValue(envelope('{"plan":{"action"')))).toMatchObject({reason:'OUTPUT_UNPARSEABLE'});
});
it('keeps the precise reason for inputs never sent, invalid bodies and a run deadline shorter than the limit',async()=>{
 const oversized=input();oversized.original.text='x'.repeat(4000);oversized.context=Array.from({length:6},()=>({id:randomUUID(),role:'USER',text:'y'.repeat(3900)}));
 const unsent=vi.fn<typeof fetch>();
 expect(await createPlannerProvider(config,unsent).plan(oversized,options()).catch(e=>e)).toMatchObject({reason:expect.stringMatching(/^(INPUT_INVALID)$/u)});expect(unsent).not.toHaveBeenCalled();
 expect(await failure(vi.fn<typeof fetch>().mockResolvedValue(new Response('{not json',{status:200,headers:{'content-type':'application/json'}})))).toMatchObject({reason:'OUTPUT_UNPARSEABLE'});
 vi.useFakeTimers();
 const hanging=vi.fn<typeof fetch>().mockImplementation((_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('PRIVATE','AbortError')),{once:true})));
 const pending=createPlannerProvider(config,hanging).plan(input(),{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+1000)}).catch(e=>e);
 await vi.advanceTimersByTimeAsync(1000);expect(await pending).toMatchObject({reason:'TIMEOUT'});
});
