import {expect,it} from 'vitest';
import {rankEvidenceResults} from '@/server/search/rank';
import {buildEvidence,hashPassage} from '@/server/search/evidence';
const now=new Date('2026-10-23T00:00:00Z');
const source=(url:string,content:string,extra={})=>({url,title:'Neon pricing',content,score:.5,...extra});
it('selects an exact relevant window rather than an irrelevant leading excerpt',()=>{
 const content='Unrelated introduction. '.repeat(90)+'Neon pricing costs $20 per month for this example.';
 const ranked=rankEvidenceResults([source('https://neon.tech/pricing',content)],'Neon pricing costs',now);
 expect(ranked).toHaveLength(1);expect(ranked[0].content).toContain('Neon pricing costs $20');expect(content).toContain(ranked[0].content);
 const evidence=buildEvidence(crypto.randomUUID(),ranked,now);expect(evidence.passages[0].contentHash).toBe(hashPassage(ranked[0].content));
});
it('deduplicates tracking variants and syndicated passages but retains contradictory amounts and negation',()=>{
 const ranked=rankEvidenceResults([source('https://neon.tech/pricing?utm_source=x','Neon pricing costs $20.'),source('https://mirror.org/','Neon pricing costs $20.'),source('https://other.org/','Neon pricing does not cost $20. It costs $30.')],'Neon pricing costs',now);
 expect(ranked).toHaveLength(2);expect(ranked.some(r=>r.content.includes('$30'))).toBe(true);
});
it('uses known publication dates and explicit preferred domains without hard diversity quotas',()=>{
 const rows=[source('https://old.org/','Neon pricing details',{published_date:'2020-01-01'}),source('https://neon.tech/a','Neon pricing details updated',{published_date:'2026-10-20'}),source('https://neon.tech/b','Neon pricing plans and costs explained')];
 const ranked=rankEvidenceResults(rows,'Neon pricing',now,{freshness:'RECENT',preferredDomains:['neon.tech']});expect(ranked[0].url).toBe('https://neon.tech/a');expect(ranked.some(r=>r.url==='https://neon.tech/b')).toBe(true);
});
it('does not truncate an unsafe page into a safe-looking passage and enforces a bounded candidate pool',()=>{
 expect(rankEvidenceResults([source('https://example.org/','Safe introduction. '.repeat(80)+'sk-or-v1-'+'a'.repeat(64))],'introduction',now)).toEqual([]);
 expect(rankEvidenceResults(Array.from({length:40},(_,i)=>source(`https://example.org/${i}`,'Neon pricing '+i)),'Neon pricing',now)).toHaveLength(5);
});
it('prefers the requested original domain over an earlier syndicated copy',()=>{
 const ranked=rankEvidenceResults([source('https://mirror.org/','Neon pricing costs $20.'),source('https://neon.tech/pricing','Neon pricing costs $20.')],'Neon pricing',now,{preferredDomains:['neon.tech']});
 expect(ranked.map(r=>r.url)).toEqual(['https://neon.tech/pricing']);
});
it('does not invent a domain preference from a framework name',async()=>{
 const {explicitPreferredDomains}=await import('@/server/search/rank');
 expect(explicitPreferredDomains('Compare Neon and Supabase for Next.js')).toEqual([]);
 expect(explicitPreferredDomains('Use site:neon.tech and https://supabase.com/docs')).toEqual(['neon.tech','supabase.com']);
});
