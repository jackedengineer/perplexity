import {expect,it} from 'vitest';
import {jobSubmission,jobCursor,executionCheck} from '@/server/jobs/contracts';
it('accepts only the registered version and intent; rejects prompts, ownership and pricing',()=>{
 const valid={version:1,workflow:'execution-check-v1',requestId:crypto.randomUUID()};
 expect(jobSubmission.parse(valid)).toEqual(valid);
 for(const extra of [{owner:'victim'},{price:0},{prompt:'unreviewed question'},{workflow:'deep-research-v1'},{version:2}])
  expect(jobSubmission.safeParse({...valid,...extra}).success).toBe(false);
});
it('bounds replay and contains no billable or arbitrary executor in the first manifest',()=>{
 expect(jobCursor.parse('0')).toBe(0);
 for(const cursor of ['-1','1.5','Infinity','1000001'])expect(jobCursor.safeParse(cursor).success).toBe(false);
 expect(executionCheck.steps.map(s=>s.key)).toEqual(['checkpoint','resume','verify']);
 expect(executionCheck.steps.every(s=>s.capMicroUsd===0n&&s.kind==='SYSTEM')).toBe(true);
});
