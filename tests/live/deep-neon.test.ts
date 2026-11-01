import {parse} from 'dotenv';
import {readFileSync} from 'node:fs';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {eq,inArray} from 'drizzle-orm';
import {createNeonFixture} from './admission-fixture';
import {models,providers} from '../integration/deep-fixture';
import {admitJob,readJob} from '@/server/jobs/admission';
import {claimJob,startStep,completeStep,recoverJobs,cancelJob} from '@/server/jobs/worker';
import {consumeResearch} from '@/server/deep-research/consumer';
import {user,billingCheckouts,jobPeriods,durableJobs,jobSteps,jobCheckpoints,jobResearchInputs,jobOutbox,jobEvents,jobReservations,operatorUsageBuckets} from '@/db/schema';
if(process.env.LIVE_DEEP_NEON!=='1')throw new Error('Explicit database-only development opt-in required');
let f:ReturnType<typeof createNeonFixture>,subject:string,owner:string;const ids:string[]=[],key='test-deep-neon-'+crypto.randomUUID();let namespaceCreated=false;
beforeAll(async()=>{
 f=createNeonFixture();const identity=await f.identity();subject=identity.subject;owner=identity.profile.id;
 await f.owner.update(user).set({emailVerified:true}).where(eq(user.id,subject));
 const suffix=crypto.randomUUID().replaceAll('-','');
 await f.owner.insert(billingCheckouts).values({userId:owner,requestId:crypto.randomUUID(),planId:'plan_deepfixture',priceKey:'pro-monthly-inr-v1',environment:'TEST',subscriptionId:'sub_'+suffix,state:'READY'});
 await f.owner.insert(jobPeriods).values({userId:owner,environment:'TEST',subscriptionId:'sub_'+suffix,paymentId:'pay_'+suffix,invoiceId:'inv_'+suffix,startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+3600000),jobLimit:5});
 await f.owner.insert(operatorUsageBuckets).values((['DAY','PERIOD'] as const).map(kind=>({budgetKey:key,kind,startsAt:new Date(Date.now()-1000),endsAt:new Date(Date.now()+3600000),providerLimitMicroUsd:400000n})));namespaceCreated=true;
},30000);
afterAll(async()=>{
 if(!f)return;
 try{for(const id of ids)await cancelJob(f.runtime,subject,id);
  if(ids.length){for(const table of [jobCheckpoints,jobResearchInputs,jobEvents,jobSteps,jobOutbox,jobReservations])await f.owner.delete(table).where(inArray(table.jobId,ids));await f.owner.delete(durableJobs).where(inArray(durableJobs.id,ids));}
  if(owner){await f.owner.delete(jobPeriods).where(eq(jobPeriods.userId,owner));await f.owner.delete(billingCheckouts).where(eq(billingCheckouts.userId,owner));}
  if(namespaceCreated)await f.owner.delete(operatorUsageBuckets).where(eq(operatorUsageBuckets.budgetKey,key));
 }finally{await f.close();}
},30000);
it('replays an atomic saved research checkpoint with restricted runtime credentials',async()=>{
 const id=await admitJob(f.runtime,subject,{version:1,workflow:'deep-research-v1',requestId:crypto.randomUUID(),question:'Compare SQLite and PostgreSQL for offline applications.',locale:'en'},key,models);ids.push(id);
 const lease=(await claimJob(f.runtime,id,key))!;await startStep(f.runtime,lease,'input');await completeStep(f.runtime,lease,'input',100n,{allowed:true});
 await f.owner.update(durableJobs).set({leaseUntil:new Date(Date.now()-1000)}).where(eq(durableJobs.id,id));await recoverJobs(f.runtime,10,key);
 const p=providers();p.input.classify=async()=>{throw new Error('Committed input must never be repeated');};
 // Avoid mutating shared fixture classifier for the remaining, distinct gates.
 p.query=providers().query;p.evidence=providers().evidence;p.output=providers().output;
 expect(await consumeResearch(f.runtime,id,{budgetKey:key,providers:p})).toBe('COMPLETED');
 expect((await readJob(f.runtime,subject,id)).report?.sections).toHaveLength(3);
 const outsider=await f.identity();await f.owner.update(user).set({emailVerified:true}).where(eq(user.id,outsider.subject));
 await expect(readJob(f.runtime,outsider.subject,id)).rejects.toThrow('NOT_FOUND');
 expect((await f.owner.select().from(jobCheckpoints).where(eq(jobCheckpoints.jobId,id))).filter(c=>c.step==='input')).toHaveLength(1);
},120000);
it('retains immutable research snapshots and denies runtime rewrite privileges',async()=>{
 const e=parse(readFileSync('.env.local'));expect(new URL(e.DATABASE_URL).username).toBe('perplex_web');
 await expect(f.runtime.update(jobCheckpoints).set({value:{tampered:true}}).where(eq(jobCheckpoints.jobId,ids[0]))).rejects.toMatchObject({cause:{code:'42501'}});
});
