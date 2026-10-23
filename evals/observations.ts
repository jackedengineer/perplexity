import {unified} from 'unified';
import remarkParse from 'remark-parse';
import {validateCitations} from '@/server/ai/citations';
import {answerObservationSchema} from './contracts';
import type {AnswerObservation} from './score-answers';
export function parseJsonLines(source:string):unknown[]{
 try{
  if(Buffer.byteLength(source,'utf8')>8_000_000)throw Error();
  const rows=source.split('\n').filter(line=>line.trim());
  if(rows.length>1000)throw Error();
  return rows.map(line=>JSON.parse(line));
 }catch{throw Error('Invalid evaluation input; no contents logged');}
}
type TextNode={type:string;children?:TextNode[];position?:{start:{offset?:number};end:{offset?:number}}};
function citationMarkers(markdown:string){
 const markers:{start:number;end:number;id:string}[]=[];
 function visit(node:TextNode){
  if(node.type==='text'&&node.position?.start.offset!==undefined&&node.position.end.offset!==undefined){
   const start=node.position.start.offset;
   for(const match of markdown.slice(start,node.position.end.offset).matchAll(/\[(S[1-5])\]/gu))markers.push({id:match[1],start:start+match.index,end:start+match.index+match[0].length});
  }
  for(const child of node.children??[])visit(child);
 }
 visit(unified().use(remarkParse).parse(markdown));return markers;
}
export function prepareAnswerObservation(value:unknown):AnswerObservation {
 const parsed=answerObservationSchema.safeParse(value);
 if(!parsed.success)throw Error('Invalid evaluation observation; no contents logged');
 const row=parsed.data,markers=citationMarkers(row.markdown);let sourceIds=new Set<string>(),citationValid=false;
 try{
  const sources=validateCitations(row.markdown,row.evidence,row.disposition==='ANSWER');
  sourceIds=new Set(sources.map(s=>s.sourceId));citationValid=true;
 }catch{}
 return {id:row.id,disposition:row.disposition,elapsedMs:row.elapsedMs,costMicroUsd:row.costMicroUsd,citationValid,
  claims:row.claims.map(c=>({support:c.support,judgeSupport:c.judgeSupport,cited:citationValid&&markers.some(m=>m.start>=c.start&&m.end<=c.end&&sourceIds.has(m.id))}))};
}
