import {z} from 'zod';
import {questionTextSchema,localeSchema} from '@/server/contracts/chat';
import {validateEvidence} from '@/server/search/evidence';
import type {DraftInput} from './answer';
import {answerSystemPrompt} from './prompts/answer';
import {citedDraftSchema} from './cited-draft';
import {AnswerError} from './bounded';
import {readerCandidates,validReader,withReader} from './reader';
export function draftPrompt(input:DraftInput){
 return JSON.stringify({question:input.question,answerLanguage:input.answerLanguage??'en',
  ...(input.reader?{reader:input.reader}:{}),
  ...(input.interpretation&&input.interpretation!==input.question?{interpretation:input.interpretation}:{}),
  passages:input.evidence.passages.map(p=>({sourceId:p.sourceId,text:p.text,
   publishedAt:input.evidence.sources.find(s=>s.sourceId===p.sourceId)?.publishedAt??null,
   retrievedAt:input.evidence.sources.find(s=>s.sourceId===p.sourceId)?.retrievedAt,contentKind:p.contentKind})),
 });
}
// Keep the complete original and a rank-preserving prefix of whole passages.
// Budget the double-encoded JSON plus schema, with 1 KiB for provider/SDK fields.
// The transport independently enforces the exact 20k wire cap before dispatch.
// What the asker told Perplex about themselves is dropped before any evidence is.
export function prepareDraftInput(input:DraftInput):DraftInput{
 const evidence=validateEvidence(input.evidence);
 if(!evidence?.sources.length||!questionTextSchema.safeParse(input.question).success||
  !localeSchema.safeParse(input.answerLanguage??'en').success||
  input.interpretation!==undefined&&!questionTextSchema.safeParse(input.interpretation).success)throw new AnswerError();
 const reader=validReader(input.reader);
 const select=(count:number,candidate:DraftInput['reader'])=>{
  const sources=evidence.sources.slice(0,count),ids=new Set(sources.map(s=>s.sourceId));
  return withReader({...input,evidence:{...evidence,sources,passages:evidence.passages.filter(p=>ids.has(p.sourceId))}},candidate);
 };
 const fits=(selected:DraftInput)=>{
  const packet=JSON.stringify({messages:[{role:'system',content:answerSystemPrompt(selected)},{role:'user',content:draftPrompt(selected)}],
   response_format:{type:'json_schema',json_schema:{name:'response',strict:true,schema:z.toJSONSchema(citedDraftSchema(selected.evidence))}}});
  return Buffer.byteLength(packet,'utf8')+1024<=20000;
 };
 for(const candidate of readerCandidates(reader)){const selected=select(evidence.sources.length,candidate);if(fits(selected))return selected;}
 for(let count=evidence.sources.length;count>0;count--){const selected=select(count,undefined);if(fits(selected))return selected;}
 throw new AnswerError();
}
