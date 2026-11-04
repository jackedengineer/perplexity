import {expect,it} from 'vitest';
import {resolveResearchTime} from '@/server/deep-research/time';
const now=new Date('2026-11-04T08:00:00Z');
it('keeps evergreen physics unrestricted, including non-temporal current',()=>{
 expect(resolveResearchTime('Explain electric current and resistance',now)).toMatchObject({kind:'EVERGREEN',startDate:null,endDate:null});
});
it('infers current evidence for changing subjects without inventing a date filter',()=>{
 expect(resolveResearchTime('Compare AI model pricing and capabilities',now)).toMatchObject({kind:'CURRENT',asOf:'2026-11-04',startDate:null,endDate:null});
});
it('honors explicit historical years before topical recency',()=>{
 expect(resolveResearchTime('Compare AI pricing in 2024',now)).toMatchObject({kind:'HISTORICAL',startDate:'2024-01-01',endDate:'2024-12-31'});
});
it('resolves calendar periods rather than rolling synonyms',()=>{
 expect(resolveResearchTime('What happened last month?',now)).toMatchObject({startDate:'2026-10-01',endDate:'2026-10-31'});
 expect(resolveResearchTime('News yesterday',now)).toMatchObject({startDate:'2026-11-03',endDate:'2026-11-03'});
});
it('supports exact ranges and rejects reversed or impossible dates',()=>{
 expect(resolveResearchTime('News from 2024-02-01 to 2024-02-29',now)).toMatchObject({startDate:'2024-02-01',endDate:'2024-02-29'});
 expect(()=>resolveResearchTime('News from 2024-03-01 to 2024-02-01',now)).toThrow();
 expect(()=>resolveResearchTime('News on 2024-02-31',now)).toThrow();
});
it('treats future forecasts as forecasts and never filters out existing evidence',()=>{
 expect(resolveResearchTime('Forecast AI adoption in 2030',now)).toMatchObject({kind:'FORECAST',startDate:null,endDate:null});
});
it('does not treat model versions or numeric quantities as a historical year',()=>{
 expect(resolveResearchTime('Compare Qwen 397B and a 2000 token context',now).startDate).toBeNull();
});
