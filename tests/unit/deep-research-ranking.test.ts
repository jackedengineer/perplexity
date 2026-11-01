import {expect,it} from 'vitest';
import {rankEvidenceResults} from '@/server/search/rank';
import {buildEvidence} from '@/server/search/evidence';
it('considers all thirty candidates and preserves distinct contrary evidence',()=>{
 const rows=Array.from({length:28},(_,i)=>({title:'General overview',url:`https://example.org/page/${i}`,content:'General database background.',score:.1}));
 rows.push({title:'SQLite offline concurrency benchmark',url:'https://www.sqlite.org/benchmark',content:'SQLite offline concurrency is fast for single writer applications.',score:.9},
  {title:'SQLite offline concurrency limits',url:'https://www.sqlite.org/limits',content:'SQLite offline concurrency is not fast for multiple writer applications.',score:.8});
 const ranked=rankEvidenceResults(rows,'SQLite offline concurrency',new Date(),{},30);
 const evidence=buildEvidence(crypto.randomUUID(),ranked,new Date());
 expect(evidence.sources.map(s=>s.url)).toContain('https://www.sqlite.org/benchmark');
 expect(evidence.sources.map(s=>s.url)).toContain('https://www.sqlite.org/limits');
 expect(evidence.passages.some(p=>p.text.includes('not fast'))).toBe(true);
});

import {researchSourcePolicy} from '@/server/deep-research/sources';
it('restricts an explicit official-docs request to reviewed authorities',()=>{
 expect(researchSourcePolicy('Compare SQLite and PostgreSQL; cite official documentation.')).toEqual({preferredDomains:['sqlite.org','postgresql.org'],domainMode:'restrict'});
 expect(researchSourcePolicy('Research offline notes')).toEqual({preferredDomains:[],domainMode:'prefer'});
 expect(researchSourcePolicy('Compare SQLite; use official documentation from site:docs.expo.dev')).toEqual({preferredDomains:['docs.expo.dev'],domainMode:'restrict'});
});

import {createTavilySearch} from '@/server/search/tavily';
it('sends an explicit primary-domain restriction without automatic search expansion',async()=>{
 let body:Record<string,unknown>|undefined;
 const p=createTavilySearch('fixture',async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify({results:[],usage:{credits:1}}),{headers:{'Content-Type':'application/json'}});});
 await p.search('SQLite official docs',{signal:new AbortController().signal,deadlineAt:new Date(Date.now()+5000),filters:{freshness:'ANY',startDate:null,endDate:null,...researchSourcePolicy('SQLite official docs')}});
 expect(body).toMatchObject({include_domains:['sqlite.org'],include_domains_mode:'restrict',auto_parameters:false,search_depth:'basic',max_results:5});
});
