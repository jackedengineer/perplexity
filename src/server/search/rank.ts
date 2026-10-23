import type {SearchResult} from './tavily';
import {canonicalSourceUrl,safeEvidenceText} from './evidence';
import {safeRawEvidenceText} from './raw-text';
const stop=new Set('a an and are as at be by can do does explain for from how in is it of on or the to what which why with'.split(' '));
const terms=(text:string)=>text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(t=>!stop.has(t))??[];
export type RankedResult=SearchResult&{contentKind?:'SEARCH_PASSAGE'|'EXTRACTED_PAGE';retrievedAt?:string};
export type RankingPreferences={freshness?:'ANY'|'RECENT'|'SPECIFIC_RANGE';preferredDomains?:string[]};
function relevantWindow(text:string,query:Set<string>){
 let best='',score=-1;
 for(let offset=0;offset<text.length;offset+=700){
  let start=offset;if(start&&/[\uDC00-\uDFFF]/u.test(text[start]))start++;
  let end=Math.min(start+1000,text.length);if(end<text.length&&/[\uDC00-\uDFFF]/u.test(text[end]))end--;
  const window=text.slice(start,end),overlap=new Set(terms(window).filter(t=>query.has(t))).size;
  if(overlap>score||overlap>0&&overlap===score&&window.length<best.length){best=window;score=overlap;}
 }
 return {text:best,overlap:score};
}
export function rankEvidenceResults(results:RankedResult[],query:string,now:Date,preferences:RankingPreferences={}):RankedResult[]{
 const wanted=new Set(terms(query)),seenUrls=new Set<string>(),seenText=new Set<string>();
 const candidates=results.slice(0,10).flatMap((row,index)=>{
  const url=canonicalSourceUrl(row.url);
  if(!url||row.title.length>300||!safeEvidenceText(row.title)||!safeRawEvidenceText(row.content))return [];
  const selected=relevantWindow(row.content,wanted),fingerprint=terms(selected.text).join(' ');
  if(!selected.text)return [];
  const date=Date.parse(row.published_date??''),knownDate=Number.isFinite(date)&&date<=now.getTime(),age=knownDate?now.getTime()-date:Infinity;
  const preferred=preferences.preferredDomains?.some(domain=>new URL(url).hostname===domain||new URL(url).hostname.endsWith('.'+domain));
  const score=selected.overlap*10+new Set(terms(row.title).filter(t=>wanted.has(t))).size*2+(preferred?3:0)+(preferences.freshness==='RECENT'&&age<=30*86400000?2:0)+row.score*.1;
  return [{row:{...row,url,content:selected.text,...(!knownDate?{published_date:null}:{})},score,index,fingerprint}];
 });
 // No hard per-domain quota: an authoritative sole source remains eligible.
 // Opposing values/negations remain distinct; lexical ranking does not prove contradiction.
 return candidates.sort((a,b)=>b.score-a.score||a.index-b.index).filter(c=>{if(seenUrls.has(c.row.url)||seenText.has(c.fingerprint))return false;seenUrls.add(c.row.url);seenText.add(c.fingerprint);return true;}).slice(0,5).map(c=>c.row);
}
export function explicitPreferredDomains(original:string){
 const hosts=new Set<string>();
 for(const match of original.matchAll(/(?:https?:\/\/|\b(?:site|domain):\s*)((?:[a-z0-9-]+\.)+[a-z]{2,63})(?:\/[^\s]*)?/giu)){
  const canonical=canonicalSourceUrl(`https://${match[1]}/`);if(canonical)hosts.add(new URL(canonical).hostname);
 }
 return [...hosts].slice(0,3);
}
