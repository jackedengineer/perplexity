import {randomUUID} from 'node:crypto';
import {expect,it,vi} from 'vitest';
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
 expect(events.every(e=>e.requestId===requestId&&e.runId===runId&&e.policyVersion==='v1')).toBe(true);
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
 expect(events.map(e=>[e.requestId,e.runId])).toEqual(expect.arrayContaining([[a,runA],[b,runB]]));
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
 expect(events).toHaveLength(1);expect(events[0]).toMatchObject({outcome:'BLOCK',categoryCodes:['FRAUD']});
});
