import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {beforeAll,beforeEach,afterAll,expect,it} from 'vitest';
import * as schema from '@/db/schema';
import {seedCompletion,completionSession,fakePlanner,fakeSafety,knownUsage,keys} from '../helpers/completion';
import {createRunExecution,type ExecutionProviders} from '@/server/runs/execute';
import {createRunAdmission} from '@/server/runs/admit';
import {submissionSchema} from '@/server/contracts/chat';
import {withTelemetry} from '@/server/telemetry/trace';
import {eq} from 'drizzle-orm';
import {createUsageReconciliation} from '@/server/runs/reconcile';
import {createFinalization} from '@/server/runs/finalize';
import {createProviderCalls} from '@/server/runs/provider-calls';
import {createRunRecovery} from '@/server/runs/recover';
import type {TelemetryEvent} from '@/server/telemetry/contracts';
const pg=new PGlite(),db=drizzle(pg,{schema});
let person:Awaited<ReturnType<typeof seedCompletion>>;
beforeAll(async()=>{const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const e of journal.entries)await pg.exec(await readFile(`drizzle/${e.tag}.sql`,'utf8'));});
beforeEach(async()=>{await db.delete(schema.user);await db.delete(schema.operatorUsageBuckets);person=await seedCompletion(db);});
afterAll(()=>pg.close());
function providers():ExecutionProviders{return {planner:fakePlanner(),input:fakeSafety(),query:fakeSafety(),evidence:fakeSafety(),output:fakeSafety(),
 answer:{modelId:'test/answer',generate:async()=>({text:'PRIVATE_DRAFT Light bends in droplets [S1].',usage:knownUsage})},
 search:{search:async()=>({results:[{title:'PRIVATE_TITLE Rainbow source',url:'https://weather.gov/rainbow',content:'PRIVATE_EVIDENCE Light bends in water droplets.',score:.9}],credits:1})}};}
async function run(p=providers(),sink?:(event:TelemetryEvent)=>void){
 const admitted=await createRunAdmission(db,keys).admit(person.subject,person.request);if(admitted.kind==='DENIED')throw Error('Synthetic admission failed');
 const identity={user:{id:person.subject},sessionId:(await completionSession(db,person.subject)).sessionId},events:TelemetryEvent[]=[],requestId=randomUUID();
 const result=await withTelemetry(requestId,()=>createRunExecution(db,keys,p).execute(identity,admitted.run,submissionSchema.parse(person.request),new AbortController().signal,()=>{}),event=>{events.push(event);sink?.(event);});
 return {result,events,requestId};
}
it('captures every paid stage and safety decision without question, draft, evidence or credentials',async()=>{
 const {events,result,requestId}=await run();expect(result.kind).toBe('COMPLETED');
 expect(events.filter(e=>e.event==='research.safety').map(e=>[e.stage,e.outcome])).toEqual([['safety.input','ALLOW'],['safety.query','ALLOW'],['safety.evidence','ALLOW'],['safety.output','ALLOW']]);
 for(const stage of ['input.accept','retrieval','search','answer.draft','citations','output.release','persistence.commit','run.execute']){
  expect(events.some(e=>e.stage===stage&&e.phase==='END'&&Number.isFinite(e.durationMs))).toBe(true);
 }
 const summary=events.find(e=>e.event==='research.run_usage');
 expect(summary).toMatchObject({requestId,runId:person.runId,policyVersion:'v1',catalogVersion:'fast-v1',priceVersion:'standard-v1',entitlementVersion:'test-v1',accountingVersion:1,
  knownCostMicroUsd:'600',costState:'PARTIAL',unknownCalls:1,inputTokens:60,outputTokens:30,searchCredits:1,estimatedUpperBoundMicroUsd:'50000',estimateKind:'RESERVATION_CEILING'});
 expect(JSON.stringify(events)).not.toMatch(/PRIVATE_|Why do rainbows|weather.gov|synthetic-subject|payloadHmac|keys|sessionId/);
});
it('counts output refusal costs and distinguishes the policy decision from infrastructure failure',async()=>{
 const p=providers();p.output={...fakeSafety(),classify:async()=>({decision:'BLOCK',categoryCodes:['FRAUD'],policyVersion:'v1'})};
 const {events,result}=await run(p);expect(result).toEqual({kind:'DENIED',code:'OUTPUT_BLOCKED'});
 expect(events.find(e=>e.event==='research.safety'&&e.stage==='safety.output')).toMatchObject({outcome:'BLOCK',categoryCodes:['FRAUD'],reason:'CLASSIFIER',promptVersion:'output-v4'});
 expect(events.find(e=>e.event==='research.run_usage')).toMatchObject({knownCostMicroUsd:'600',searchCredits:1,unknownCalls:1});
 expect(await db.select().from(schema.messages)).toHaveLength(1);
});
it('a failing search has a complete redacted trace and retains unknown monetary usage',async()=>{
 const p=providers();p.search={search:async()=>{await new Promise(r=>setTimeout(r,40));throw Error('PRIVATE_PROVIDER_DIAGNOSTICS secret-key');}};
 const {events,result}=await run(p);expect(result).toEqual({kind:'DENIED',code:'PROVIDER_UNAVAILABLE'});
 expect(events.find(e=>e.stage==='search'&&e.phase==='END')).toMatchObject({outcome:'PROVIDER_UNAVAILABLE',durationMs:expect.any(Number)});
 expect(events.find(e=>e.event==='research.run_usage')).toMatchObject({knownCostMicroUsd:'300',costState:'PARTIAL',unknownCalls:1,searchCredits:null});
 expect(events.some(e=>e.stage==='persistence.fail'&&e.phase==='END')).toBe(true);
 expect(JSON.stringify(events)).not.toMatch(/PRIVATE_|secret-key|weather.gov|Why do rainbows/);
 await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/t20-failed-trace.jsonl',events.map(e=>JSON.stringify(e)).join('\n')+'\n');
});
it('a logging outage cannot prevent atomic answer persistence or add provider work',async()=>{
 expect((await run(providers(),()=>{throw Error('PRIVATE_LOGGING_OUTAGE');})).result.kind).toBe('COMPLETED');
 expect(await db.select().from(schema.providerCalls)).toHaveLength(7);expect(await db.select().from(schema.runSettlements)).toHaveLength(1);
});
async function operatorReports(){
 const source=await readFile('docs/operations.sql','utf8'),reports:Record<string,Record<string,unknown>[]>= {};
 for(const block of source.split(/^-- name: /mu).slice(1)){
  const end=block.indexOf('\n'),name=block.slice(0,end).trim();
  reports[name]=(await pg.query<Record<string,unknown>>(block.slice(end+1))).rows;
 }
 return reports;
}
it('executes the operator query set with honest failure, latency, cost and feedback denominators',async()=>{
 await run();const reports=await operatorReports();
 expect(Object.keys(reports)).toEqual(['run_outcomes','provider_latency','retrieval_health','safety_decisions','false_refusal_feedback','reservations','costs']);
 expect(reports.costs[0]).toMatchObject({known_micro_usd:'600',booked_micro_usd:'600',held_micro_usd:'49400',unknown_calls:1,search_credits:1});
 expect(reports.reservations[0]).toMatchObject({reason:'AWAITING_USAGE',held_micro_usd:'49400'});
 expect(reports.provider_latency).toHaveLength(7);expect(reports.provider_latency.every(r=>Number(r.p95_ms)>=0)).toBe(true);
 expect(reports.false_refusal_feedback[0]).toMatchObject({coverage:'NOT_COLLECTED_T17',false_refusal_rate:null,labeled_cases:null});
 expect(JSON.stringify(reports)).not.toMatch(/PRIVATE_|Why do rainbows|weather.gov|sessionId|payloadHmac/);
});
it('operator cost totals include reconciled receipts once and reveal missing settlement',async()=>{
 await run();const [search]=await db.select().from(schema.providerCalls).where(eq(schema.providerCalls.stage,'SEARCH'));
 await db.insert(schema.providerUsageResolutions).values({runId:person.runId,callId:search.id,costMicroUsd:300n,kind:'PROVIDER_RECEIPT',evidenceHash:'b'.repeat(64)});
 await createUsageReconciliation(db).reconcile(person.subject,person.runId);
 const reports=await operatorReports();
 expect(reports.costs[0]).toMatchObject({known_micro_usd:'900',booked_micro_usd:'900',held_micro_usd:'0',unknown_calls:0});
 expect(reports.reservations).toHaveLength(0);
 const other=await seedCompletion(db);
 await db.update(schema.runs).set({createdAt:new Date(Date.now()-120000),deadlineAt:new Date(Date.now()-1000)}).where(eq(schema.runs.id,other.runId));
 expect((await operatorReports()).reservations).toEqual(expect.arrayContaining([expect.objectContaining({run_id:other.runId,reason:'EXPIRED_ACTIVE'})]));
});
it('does not count an input-refusal settlement placeholder as an output safety check',async()=>{
 const p=providers();p.input={...fakeSafety(),classify:async()=>({decision:'BLOCK',categoryCodes:['FRAUD'],policyVersion:'v1'})};
 await run(p);const reports=await operatorReports();
 expect(reports.safety_decisions).toEqual([{gate:'INPUT',decision:'BLOCK',policy_version:'v1',decisions:1}]);
 expect(reports.costs[0]).toMatchObject({cost_state:'KNOWN',known_micro_usd:'100',held_micro_usd:'0',search_credits:0,unknown_search_credits:0});
});
it('excludes a recovered output placeholder when only an unfinished provider claim exists',async()=>{
 await db.update(schema.runs).set({status:'CHECKING_OUTPUT'}).where(eq(schema.runs.id,person.runId));
 await createProviderCalls(db,person.subject,person.runId).begin('OUTPUT_SAFETY','test/safety');
 await db.update(schema.runs).set({createdAt:new Date(Date.now()-120000),deadlineAt:new Date(Date.now()-1000)}).where(eq(schema.runs.id,person.runId));
 expect((await createRunRecovery(db).sweep()).recovered).toBe(1);
 expect(await db.select().from(schema.outputReviews)).toHaveLength(1);
 expect((await operatorReports()).safety_decisions).toEqual([]);
});
it('keeps legacy accounting visibly unknown instead of presenting it as free usage',async()=>{
 expect((await operatorReports()).costs[0]).toMatchObject({search_credits:0,unknown_search_credits:0});
 await db.update(schema.runs).set({accountingVersion:0}).where(eq(schema.runs.id,person.runId));
 await createFinalization(db).fail(person.subject,person.runId,'PROVIDER_UNAVAILABLE');
 expect((await operatorReports()).costs[0]).toMatchObject({cost_state:'UNKNOWN_LEGACY',held_micro_usd:'50000',search_credits:null,unknown_search_credits:null});
});
it('operator reports distinguish no-dispatch searches from unknown dispatched credits',async()=>{
 await run();
 await db.update(schema.providerCalls).set({status:'SKIPPED',costMicroUsd:0n,searchCredits:null}).where(eq(schema.providerCalls.stage,'SEARCH'));
 expect((await operatorReports()).costs[0]).toMatchObject({search_credits:0,unknown_search_credits:0,unknown_calls:0});
 await db.update(schema.providerCalls).set({status:'UNKNOWN',costMicroUsd:null}).where(eq(schema.providerCalls.stage,'SEARCH'));
 expect((await operatorReports()).costs[0]).toMatchObject({search_credits:null,unknown_search_credits:1,unknown_calls:1});
});
