import {expect,it} from 'vitest';
import {jobSubmission,manifestFor} from '@/server/jobs/contracts';
import {deepResearch,researchPlan} from '@/server/deep-research/contracts';
it('accepts a bounded research question but no caller model, owner or budget',()=>{
 const input={version:1,workflow:'deep-research-v1',requestId:crypto.randomUUID(),question:'Compare PostgreSQL and SQLite for offline applications.',locale:'en'};
 expect(jobSubmission.safeParse(input).success).toBe(true);
 for(const extra of [{model:'expensive'},{owner:'victim'},{question:'x'.repeat(1001)},{budget:999}])expect(jobSubmission.safeParse({...input,...extra}).success).toBe(false);
});
it('pins each paid operation to a unique bounded step and limits queries',()=>{
 expect(manifestFor('deep-research-v1')).toEqual(deepResearch);
 expect(()=>manifestFor('arbitrary')).toThrow();
 expect(new Set(deepResearch.steps.map(s=>s.key)).size).toBe(deepResearch.steps.length);
 expect(deepResearch.steps.filter(s=>s.key.startsWith('search-'))).toHaveLength(6);
 expect(deepResearch.steps.reduce((n,s)=>n+s.capMicroUsd,0n)).toBeLessThan(250000n);
 expect(researchPlan.safeParse({queries:['same','same','same'],focus:'test'}).success).toBe(false);
});
