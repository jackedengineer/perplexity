import {afterAll,afterEach,beforeAll,expect,it} from 'vitest';
import {operatorUsageBuckets} from '@/db/schema';
import {jobsFixture} from './jobs-fixture';
import {models,providers} from './deep-fixture';
import {admitJob,readJob} from '@/server/jobs/admission';
import {consumeResearch} from '@/server/deep-research/consumer';
import {cancelJob} from '@/server/jobs/worker';
let f:Awaited<ReturnType<typeof jobsFixture>>,activeId:string|undefined;
beforeAll(async()=>{f=await jobsFixture();await f.db.update(operatorUsageBuckets).set({providerLimitMicroUsd:1000000n});},30000);
afterEach(async()=>{if(activeId)await cancelJob(f.db,f.subject,activeId);activeId=undefined;});
afterAll(()=>f?.pg.close());
async function admitted(){return activeId=await admitJob(f.db,f.subject,{version:1,workflow:'deep-research-v1',requestId:crypto.randomUUID(),question:'Compare SQLite and PostgreSQL for offline applications.',locale:'en'},f.key,models);}
it('drops an explicitly unsafe extracted source instead of retaining its safe-looking snippet',async()=>{
 const id=await admitted(),p=providers();let drafted=false;
 p.extract.extract=async urls=>({pages:[],failedUrls:[],rejectedUrls:[...urls],credits:0});
 p.answer.generate=async()=>{drafted=true;throw new Error('Rejected source must not be drafted');};
 expect(await consumeResearch(f.db,id,{providers:p,budgetKey:f.key})).toBe('FAILED');expect(drafted).toBe(false);expect((await readJob(f.db,f.subject,id)).report).toBeUndefined();
});
it('retains snippet fallback for ordinary extraction failures without safety rejections',async()=>{
 const id=await admitted(),p=providers();p.extract.extract=async urls=>({pages:[],failedUrls:[...urls],rejectedUrls:[],credits:0});
 expect(await consumeResearch(f.db,id,{providers:p,budgetKey:f.key})).toBe('COMPLETED');
 expect((await readJob(f.db,f.subject,id)).report?.sections[0].answer.sources[0].contentKind).toBe('SEARCH_PASSAGE');
});
