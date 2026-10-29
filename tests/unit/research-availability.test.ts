import {expect,it} from 'vitest';
import {hasResearchCapacity} from '@/server/runs/availability';
const row={kind:'DAY',providerLimitMicroUsd:400000n,reservedProviderMicroUsd:198184n,settledProviderMicroUsd:1816n};
it('requires exactly one day and period with enough room for a complete run',()=>{
 expect(hasResearchCapacity([])).toBe(false);
 expect(hasResearchCapacity([row,row])).toBe(false);
 expect(hasResearchCapacity([row,{...row,kind:'PERIOD'}])).toBe(true);
 expect(hasResearchCapacity([row,{...row,kind:'PERIOD',reservedProviderMicroUsd:349000n}])).toBe(false);
 expect(hasResearchCapacity([row,{...row,kind:'PERIOD',reservedProviderMicroUsd:348184n}])).toBe(true);
});
