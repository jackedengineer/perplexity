import {z} from 'zod';
import {questionTextSchema,localeSchema} from '@/server/contracts/chat';
import {validateEvidence} from '@/server/search/evidence';
import type {DraftInput} from './answer';
import {ANSWER_PROMPT} from './prompts/answer';
import {citedDraftSchema} from './cited-draft';
import {AnswerError} from './bounded';
export function draftPrompt(input:DraftInput){
 return JSON.stringify({question:input.question,answerLanguage:input.answerLanguage??'en',
  ...(input.interpretation&&input.interpretation!==input.question?{interpretation:input.interpretation}:{}),
  passages:input.evidence.passages.map(p=>({sourceId:p.sourceId,text:p.text,
   publishedAt:input.evidence.sources.find(s=>s.sourceId===p.sourceId)?.publishedAt??null,
   retrievedAt:input.evidence.sources.find(s=>s.sourceId===p.sourceId)?.retrievedAt,contentKind:p.contentKind})),
 });
}
// Keep the complete original and a rank-preserving prefix of whole passages.
// Budget the double-encoded JSON plus schema, with 1 KiB for provider/SDK fields.
// The transport independently enforces the exact 20k wire cap before dispatch.
export function prepareDraftInput(input:DraftInput):DraftInput{
 const evidence=validateEvidence(input.evidence);
 if(!evidence?.sources.length||!questionTextSchema.safeParse(input.question).success||
  !localeSchema.safeParse(input.answerLanguage??'en').success||
  input.interpretation!==undefined&&!questionTextSchema.safeParse(input.interpretation).success)throw new AnswerError();
 for(let count=evidence.sources.length;count>0;count--){
  const sources=evidence.sources.slice(0,count),ids=new Set(sources.map(s=>s.sourceId));
  const selected={...input,evidence:{...evidence,sources,passages:evidence.passages.filter(p=>ids.has(p.sourceId))}};
  const packet=JSON.stringify({messages:[{role:'system',content:ANSWER_PROMPT},{role:'user',content:draftPrompt(selected)}],
   response_format:{type:'json_schema',json_schema:{name:'response',strict:true,schema:z.toJSONSchema(citedDraftSchema(selected.evidence))}}});
  if(Buffer.byteLength(packet,'utf8')+1024<=20000)return selected;
 }
 throw new AnswerError();
}
