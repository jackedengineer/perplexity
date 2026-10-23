import {randomUUID} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {trace} from '@opentelemetry/api';
import {withTelemetry,traceStage,recordTelemetry,bindRunTelemetry} from '@/server/telemetry/trace';
import {metricDimensions} from '@/server/telemetry/metrics';
import type {TelemetryEvent} from '@/server/telemetry/contracts';
it('traces asynchronous stages with server correlation while dropping content and arbitrary errors',async()=>{
 const events:TelemetryEvent[]=[],requestId=randomUUID(),runId=randomUUID();
 await withTelemetry(requestId,async()=>{
  bindRunTelemetry({runId,policyVersion:'v1',catalogVersion:'fast-v1',priceVersion:'standard-v1',entitlementVersion:'free-v1',accountingVersion:1});
  await traceStage('run.execute',async()=>{
   await traceStage('safety.input',async()=>{await Promise.resolve();return {decision:'ALLOW',prompt:'PRIVATE PROMPT'};},()=>({outcome:'ALLOW',prompt:'PRIVATE PROMPT'}));
   recordTelemetry('research.sources',{sourceCount:1,discardedSources:2,url:'https://PRIVATE',text:'PRIVATE EVIDENCE'});
   await expect(traceStage('answer.draft',async()=>{throw new Error('PRIVATE DRAFT AND KEY');})).rejects.toThrow('PRIVATE');
  });
 },event=>events.push(event));
 expect(events.every(e=>e.requestId===requestId)).toBe(true);
 expect(events.filter(e=>e.stage!=='http.request'||e.phase==='END').every(e=>e.runId===runId&&e.policyVersion==='v1')).toBe(true);
 const parent=events.find(e=>e.stage==='run.execute'&&e.phase==='START')!;
 const child=events.find(e=>e.stage==='safety.input'&&e.phase==='END')!;
 expect(child).toMatchObject({traceId:parent.traceId,parentSpanId:parent.spanId,outcome:'ALLOW'});
 expect(child.durationMs).toBeGreaterThanOrEqual(0);
 expect(events.find(e=>e.stage==='answer.draft'&&e.phase==='END')).toMatchObject({outcome:'ERROR'});
 expect(JSON.stringify(events)).not.toMatch(/PRIVATE|prompt|draftText|stack|https:/);
});
it('keeps concurrent request/run context isolated and does not trust incoming fields',async()=>{
 const events:TelemetryEvent[]=[],a=randomUUID(),b=randomUUID(),runA=randomUUID(),runB=randomUUID();
 await Promise.all([[a,runA],[b,runB]].map(([id,runId])=>withTelemetry(id,async()=>{
  bindRunTelemetry({runId});await Promise.resolve();recordTelemetry('research.sources',{requestId:'attacker',runId:'attacker',traceId:'attacker',sourceCount:1});
 },e=>events.push(e))));
 expect(events.filter(e=>e.runId).map(e=>[e.requestId,e.runId])).toEqual(expect.arrayContaining([[a,runA],[b,runB]]));
 expect(JSON.stringify(events)).not.toContain('attacker');
});
it('never retries work or changes its outcome when the telemetry sink throws',async()=>{
 const work=vi.fn(async()=>42);
 expect(await withTelemetry(randomUUID(),()=>traceStage('run.execute',work),()=>{throw Error('PRIVATE sink');})).toBe(42);
 expect(work).toHaveBeenCalledOnce();
});
it('exports bounded metric dimensions without IDs, versions, models or safety categories',()=>{
 expect(metricDimensions({stage:'safety.output',outcome:'OUTPUT_BLOCKED',runId:randomUUID(),requestId:randomUUID(),modelId:'arbitrary/model',policyVersion:'v1',categoryCodes:['FRAUD']})).toEqual({stage:'safety.output',outcome:'OUTPUT_BLOCKED',category:'policy'});
});
it('invalid fields and raw-provider outcome labels cannot escape the schema',async()=>{
 const events:TelemetryEvent[]=[];
 await withTelemetry(randomUUID(),async()=>{
  recordTelemetry('research.safety',{outcome:'PRIVATE provider message',categoryCodes:['PRIVATE'],durationMs:NaN});
  recordTelemetry('research.safety',{outcome:'BLOCK',categoryCodes:['FRAUD'],reason:'CLASSIFIER'});
 },e=>events.push(e));
 expect(events.filter(e=>e.event==='research.safety')).toHaveLength(1);expect(events.find(e=>e.event==='research.safety')).toMatchObject({outcome:'BLOCK',categoryCodes:['FRAUD']});
});
it('a broken OpenTelemetry adapter cannot retry work or expose its diagnostics',async()=>{
 const broken=vi.spyOn(trace,'getTracer').mockImplementation(()=>{throw Error('PRIVATE EXPORTER');});
 const events:TelemetryEvent[]=[],work=vi.fn(async()=>42);
 try{expect(await withTelemetry(randomUUID(),()=>traceStage('run.execute',work),e=>events.push(e))).toBe(42);expect(work).toHaveBeenCalledOnce();expect(JSON.stringify(events)).not.toContain('PRIVATE');}
 finally{broken.mockRestore();}
});
it('contains asynchronous sink rejection without changing the operation',async()=>{
 const work=vi.fn(async()=>42);
 expect(await withTelemetry(randomUUID(),()=>traceStage('run.execute',work),async()=>{throw Error('PRIVATE async sink');})).toBe(42);
 await new Promise(resolve=>setImmediate(resolve));expect(work).toHaveBeenCalledOnce();
});
it('retains safety and provider events for the longest supported configured model',async()=>{
 const events:TelemetryEvent[]=[],modelId='test/'+ 'a'.repeat(123);
 await withTelemetry(randomUUID(),async()=>{
  recordTelemetry('research.safety',{outcome:'ALLOW',modelId});
  recordTelemetry('research.provider_started',{providerCallId:randomUUID(),providerStage:'INPUT_SAFETY',modelId});
 },e=>events.push(e));
 expect(events.filter(e=>e.modelId===modelId)).toHaveLength(2);
});
it('reports a skipped search as known zero credits while dispatched unknown stays unknown',async()=>{
 const {recordProviderObservation,recordRunUsage}=await import('@/server/telemetry/trace');
 const events:TelemetryEvent[]=[];
 await withTelemetry(randomUUID(),async()=>{
  recordProviderObservation({providerCallId:randomUUID(),providerStage:'SEARCH',outcome:'SKIPPED',costState:'KNOWN',knownCostMicroUsd:'0',searchCredits:null});recordRunUsage();
 },e=>events.push(e));
 expect(events.find(e=>e.event==='research.run_usage')).toMatchObject({searchCredits:0,unknownCalls:0});
});
it('exports a real request root and connects nested exported spans to it',async()=>{
 const exported:{name:string;parent?:string;id:string;ended:boolean}[]=[];
 const startActiveSpan=trace.getTracer('test').startActiveSpan;
 const tracer=vi.spyOn(trace,'getTracer').mockReturnValue({startActiveSpan,startSpan(name,_options,context){
  const parent=context?trace.getSpanContext(context):undefined,id=String(exported.length+1).padStart(16,'0');
  const item={name,parent:parent?.spanId,id,ended:false};exported.push(item);
  return {spanContext:()=>({traceId:parent?.traceId??'a'.repeat(32),spanId:id,traceFlags:1}),setAttributes(){return this;},setStatus(){return this;},setAttribute(){return this;},addEvent(){return this;},addLink(){return this;},addLinks(){return this;},updateName(){return this;},isRecording(){return true;},recordException(){},end(){item.ended=true;}};
 }} as ReturnType<typeof trace.getTracer>);
 try{
  await withTelemetry(randomUUID(),()=>traceStage('run.execute',async()=>42),()=>{});
  expect(exported.map(e=>[e.name,e.parent,e.ended])).toEqual([['http.request',undefined,true],['run.execute',exported[0].id,true]]);
 }finally{tracer.mockRestore();}
});
it('retains run totals above one provider call limit without widening per-call observations',async()=>{
 const {recordProviderObservation,recordRunUsage}=await import('@/server/telemetry/trace');
 const events:TelemetryEvent[]=[];
 await withTelemetry(randomUUID(),async()=>{
  for(const providerStage of ['INPUT_SAFETY','QUERY_SAFETY','EVIDENCE_SAFETY','ANSWER','OUTPUT_SAFETY'] as const)
   recordProviderObservation({providerCallId:randomUUID(),providerStage,outcome:'SUCCEEDED',costState:'KNOWN',knownCostMicroUsd:'100',inputTokens:1_000_000,outputTokens:1_000_000});
  recordProviderObservation({providerCallId:randomUUID(),providerStage:'ANSWER',inputTokens:1_000_001});
  recordRunUsage();
 },e=>events.push(e));
 expect(events.filter(e=>e.event==='research.usage')).toHaveLength(5);
 expect(events.find(e=>e.event==='research.run_usage')).toMatchObject({inputTokens:5_000_000,outputTokens:5_000_000,knownCostMicroUsd:'500',unknownCalls:0,searchCredits:0});
});
