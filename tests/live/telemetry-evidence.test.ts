import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {telemetryEventSchema,type TelemetryEvent} from '@/server/telemetry/contracts';
it('verifies captured desktop/mobile browser traces without private research content',async()=>{
 if(process.env.LIVE_TELEMETRY_EVIDENCE!=='1')throw Error('Explicit captured-browser evidence opt-in required');
 const first=await readFile('.artifacts/t20-browser.log','utf8'),final=await readFile('.artifacts/t20-final-browser.log','utf8');
 expect(first).toContain('8 passed');expect(final).toContain('4 passed');const source=first+'\n'+final;
 const records=source.split('\n').flatMap(line=>{
  const match=/^\[WebServer\] (\{.*\})$/u.exec(line);if(!match)return [];
  const value=JSON.parse(match[1]);return typeof value.event==='string'&&value.event.startsWith('research.')?[telemetryEventSchema.strict().parse(value)]:[];
 });
 expect(records.length).toBeGreaterThan(100);
 expect(JSON.stringify(records)).not.toMatch(/PRIVATE_UPSTREAM_MUST_NOT_LEAK|PRIVATE_REASONING_MUST_NOT_LEAK|UNREVIEWED_PRIVATE_DRAFT|Why do rainbows form|rainbow formation|Water droplets refract/iu);
 const traces=new Map<string,string>(),starts=new Map<string,TelemetryEvent>();
 for(const event of records){
  expect(traces.get(event.requestId)??event.traceId).toBe(event.traceId);traces.set(event.requestId,event.traceId);
  const key=event.requestId+':'+event.spanId;
  if(event.phase==='START'){expect(starts.has(key)).toBe(false);if(event.parentSpanId)expect(starts.has(event.requestId+':'+event.parentSpanId)).toBe(true);starts.set(key,event);}
  if(event.phase==='END'){expect(starts.get(key)?.stage).toBe(event.stage);expect(event.durationMs).toBeGreaterThanOrEqual(0);}
 }
 const ended=records.filter(e=>e.stage==='run.execute'&&e.phase==='END');
 expect(ended).toHaveLength(12);
 for(const [outcome,count] of Object.entries({COMPLETED:4,INPUT_BLOCKED:2,OUTPUT_BLOCKED:4,PROVIDER_UNAVAILABLE:2}))expect(ended.filter(e=>e.outcome===outcome)).toHaveLength(count);
 for(const run of ended){
  const own=records.filter(e=>e.runId===run.runId),summary=own.find(e=>e.event==='research.run_usage')!;
  expect(summary).toMatchObject({policyVersion:'v1',priceVersion:'standard-v1',catalogVersion:'fast-v1',estimatedUpperBoundMicroUsd:'50000'});
  const calls=own.filter(e=>e.event==='research.usage');
  expect(new Set(calls.map(e=>e.providerCallId)).size).toBe(calls.length);
  expect(summary.knownCostMicroUsd).toBe(String(calls.reduce((n,e)=>n+BigInt(e.knownCostMicroUsd??'0'),0n)));
  if(run.outcome==='OUTPUT_BLOCKED'){
   expect(summary.knownCostMicroUsd).toBe('500');
   expect(own.find(e=>e.event==='research.safety'&&e.stage==='safety.output')).toMatchObject({outcome:'BLOCK',categoryCodes:['FRAUD']});
  }
  if(run.outcome==='PROVIDER_UNAVAILABLE')expect(summary).toMatchObject({knownCostMicroUsd:'200',unknownCalls:1,searchCredits:null});
 }
 const progress=records.filter(e=>e.event==='research.first_progress'),delivered=records.filter(e=>e.event==='research.approved_delivery');
 expect(progress.length).toBeGreaterThan(0);expect(delivered.length).toBeGreaterThanOrEqual(2);
 console.info(JSON.stringify({event:'t20.browser_evidence_verified',records:records.length,runs:ended.length,knownMicroUsd:records.filter(e=>e.event==='research.run_usage').reduce((n,e)=>n+Number(e.knownCostMicroUsd??0),0),firstProgressMs:progress.map(e=>e.durationMs),approvedDeliveryMs:delivered.map(e=>e.durationMs)}));
});
