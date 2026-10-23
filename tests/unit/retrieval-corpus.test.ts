import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {z} from 'zod';
import {rankEvidenceResults} from '@/server/search/rank';
import {buildEvidence} from '@/server/search/evidence';
const fixture=z.strictObject({id:z.string(),query:z.string(),preferences:z.object({freshness:z.enum(['ANY','RECENT','SPECIFIC_RANGE']).optional(),preferredDomains:z.array(z.string()).optional()}),results:z.array(z.object({title:z.string(),url:z.string(),content:z.string(),score:z.number(),published_date:z.string().optional()})),requiredUrls:z.array(z.string()),topUrl:z.string().nullable(),requiredPhrase:z.string().nullable(),humanReviewed:z.literal(false)});
it('runs the authored retrieval set, retaining conflicting sources and exact relevant excerpts',async()=>{
 const cases=(await readFile('evals/cases/retrieval.jsonl','utf8')).trim().split('\n').map(line=>fixture.parse(JSON.parse(line)));expect(cases).toHaveLength(5);
 let baselineTop1=0,rankedTop1=0,topCases=0;
 for(const c of cases){
  const ranked=rankEvidenceResults(c.results,c.query,new Date('2026-10-23T00:00:00Z'),c.preferences),evidence=buildEvidence(crypto.randomUUID(),ranked,new Date());
  expect(evidence.sources.map(s=>s.url),c.id).toEqual(expect.arrayContaining(c.requiredUrls));
  if(c.topUrl){topCases++;if(c.results[0].url===c.topUrl)baselineTop1++;if(ranked[0].url===c.topUrl)rankedTop1++;expect(ranked[0].url,c.id).toBe(c.topUrl);}
  if(c.requiredPhrase){expect(evidence.passages.some(p=>p.text.includes(c.requiredPhrase!)),c.id).toBe(true);expect(c.results[0].content.slice(0,1000)).not.toContain(c.requiredPhrase);}
 }
 expect({baselineTop1,rankedTop1,topCases}).toEqual({baselineTop1:2,rankedTop1:4,topCases:4});
});
