import {z} from 'zod';
import {queryPlanSchema,type QueryPlan} from '@/server/contracts/pipeline';
import {MAX_SUBMISSION_BYTES,localeSchema,questionTextSchema,timezoneSchema} from '@/server/contracts/chat';
import {safeEvidenceText} from '@/server/search/evidence';
import {freshnessTimeRange} from '@/server/search/freshness';
export const PLANNING_VERSION="planner-v4";
export const PLANNER_LIMITS=Object.freeze({contextMessages:6,inputBytes:MAX_SUBMISSION_BYTES,wireBytes:23000,queryCount:1,clarificationCharacters:240});
const turn=z.strictObject({id:z.uuid(),role:z.enum(['USER','ASSISTANT']),text:questionTextSchema});
const plannerInputShape=z.strictObject({original:z.strictObject({id:z.uuid(),text:questionTextSchema}),context:z.array(turn).max(6),now:z.iso.datetime(),timezone:timezoneSchema,locale:localeSchema.nullable()});
export const plannerInputSchema=plannerInputShape
 .refine(value=>new Set([value.original.id,...value.context.map(m=>m.id)]).size===value.context.length+1&&Buffer.byteLength(JSON.stringify(value),'utf8')<=PLANNER_LIMITS.inputBytes);
export type PlannerInput=z.infer<typeof plannerInputSchema>;
// Keep the original intact and choose the newest contiguous whole turns by wire
// bytes, not character count. Any valid 4,000-character original fits alone.
export function preparePlanningInput(value:PlannerInput):PlannerInput{
 const input=plannerInputShape.parse(value),selected={...input,context:[] as PlannerInput['context']};
 for(const message of [...input.context].reverse()){
  const context=[message,...selected.context];
  if(Buffer.byteLength(JSON.stringify({...selected,context}),'utf8')>PLANNER_LIMITS.inputBytes)break;
  selected.context=context;
 }
 return plannerInputSchema.parse(selected);
}
export class PlanningError extends Error{constructor(){super('Planning unavailable');}}
const genericWords=new Set(('a an and are as at about be between by can compare comparison cost costs current date dates describe differences do does explain explanation fact facts features find for from general give how in information is latest me of official on or overview plans please price prices pricing question recent research resources results review search sources than the their them then these they this those to topic use using vs versus was were what when where which why with without work works you your it its that into details summary summarize provide tell more examples difference brief briefly concise sentence sentences word words').split(' '));
const words=(text:string)=>(text.normalize('NFKC').replace(/[’‘]/gu,"'").toLowerCase().match(/[\p{L}\p{N}]+(?:[._'-][\p{L}\p{N}]+)*/gu)??[]).map(word=>word.replace(/'s$/u,''));
const numeric=(text:string)=>text.normalize('NFKC').match(/\d+(?:[.,/-]\d+)*/gu)?.map(v=>v.replaceAll(',',''))??[];
const references=/\b(?:it|its|they|their|them|that|this|these|those|former|latter)\b/iu;
const negative=/\b(?:not|no|without|exclude|excluding|avoid|except|never|don't|doesn't)\b/giu;
const clarificationWords=new Set('product products service services comparing mean refer referring information topic topics requirements requirement important matters matter aspect aspects options option criteria priorities priority goals goal purpose needs need looking clarify specify range location timeframe time region country currency audience case cases main budget workload constraints type detail details consider intended'.split(' '));
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
// Conservative provenance validation, not a semantic-equivalence or safety proof.
// Actual outbound queries still require the independent semantic safety gate.
export function validatePlan(value:unknown,input:unknown,maxQueries:number=PLANNER_LIMITS.queryCount):QueryPlan{
 try{
  const original=plannerInputSchema.parse(input),plan=queryPlanSchema.parse(value);
  const resolving=references.test(original.original.text);
  const context=resolving?original.context:[];
  const users=[original.original,...context.filter(m=>m.role==='USER')];
  const vocabulary=new Set(words([original.original.text,...context.map(m=>m.text)].join(' ')));
  const userNumbers=new Set(users.flatMap(m=>numeric(m.text)));
  if(plan.action==='CLARIFY'){
   if(standaloneFallback(original)||resolvePricingFollowup(original))throw new PlanningError();
   if(plan.question.length>240||(plan.question.match(/\?/gu)?.length??0)>1||/[\r\n]/u.test(plan.question)||!safeEvidenceText(plan.question)||/https?:|www\./iu.test(plan.question))throw new PlanningError();
   if(words(plan.question).some(word=>!vocabulary.has(word)&&!genericWords.has(word)&&!clarificationWords.has(word))||numeric(plan.question).some(n=>!userNumbers.has(n)))throw new PlanningError();
   return freeze(plan);
  }
  if(![1,2].includes(maxQueries)||!plan.retrieval.required||plan.retrieval.queries.length>maxQueries||plan.disclosedAssumptions.length)throw new PlanningError();
  for(const constraint of plan.explicitConstraints){
   const source=users.find(m=>m.id===constraint.sourceMessageId);
   if(constraint.name!=='EXPLICIT'||!source||!source.text.includes(constraint.value))throw new PlanningError();
  }
  const derived=[plan.standaloneQuestion,...plan.retrieval.queries];
  if(derived.some(text=>!safeEvidenceText(text)||words(text).some(word=>!vocabulary.has(word)&&!genericWords.has(word))||numeric(text).some(n=>!userNumbers.has(n))))throw new PlanningError();
  // Rewrites cannot erase explicit negation, numeric limits or named user topics.
  const standaloneWords=new Set(words(plan.standaloneQuestion));
  const anchors=words(original.original.text).filter(w=>!genericWords.has(w));
  if(anchors.some(w=>!standaloneWords.has(w))||numeric(original.original.text).some(n=>!numeric(plan.standaloneQuestion).includes(n)))throw new PlanningError();
  for(const negation of original.original.text.match(negative)??[])if(!standaloneWords.has(negation.toLowerCase()))throw new PlanningError();
  if(references.test(original.original.text)){
   if(!original.context.length)throw new PlanningError();
   const previous=new Set(original.context.flatMap(m=>words(m.text)).filter(w=>!genericWords.has(w)));
   if(!words(plan.standaloneQuestion).some(w=>previous.has(w))||references.test(plan.standaloneQuestion))throw new PlanningError();
  }
  if(plan.retrieval.freshness==='RECENT'&&!freshnessTimeRange(users.map(m=>m.text).join(' ')))throw new PlanningError();
  if(plan.retrieval.freshness==='SPECIFIC_RANGE'&&![plan.retrieval.startDate,plan.retrieval.endDate].every(date=>users.some(m=>m.text.includes(date!))))throw new PlanningError();
  return freeze(plan);
 }catch{throw new PlanningError();}
}
export function standaloneFallback(value:unknown):QueryPlan|null{
 try{
  const input=plannerInputSchema.parse(value),text=input.original.text;
  const compare=/^compare\s+\S[\s\S]{0,240}\s+(?:and|vs\.?|versus)\s+\S/iu.test(text.trim());
  if(text.length>300||references.test(text)||/\b(?:best|better|recommend)\b/iu.test(text)||!compare&&!/^(?:explain|define|describe|why (?:do|does|is)|how (?:do|does)|what (?:is|are))\s+\S+/iu.test(text.trim()))return null;
  return validatePlan({action:'ANSWER',standaloneQuestion:text,intent:compare?'COMPARE':'EXPLAIN',explicitConstraints:[],disclosedAssumptions:[],retrieval:{required:true,queries:[text],freshness:freshnessTimeRange(text)?'RECENT':'ANY',startDate:null,endDate:null},answerLanguage:input.locale??'en'},input);
 }catch{return null;}
}

// A deliberately narrow local planning rule, not semantic memory or a fallback
// after an unknown model call: one literal USER topic and one exact pricing follow-up.
export function resolvePricingFollowup(value:unknown):QueryPlan|null{
 try{
  const input=plannerInputSchema.parse(value);
  if(!/^(?:what|how) about its pricing\??$/iu.test(input.original.text.trim()))return null;
  const users=input.context.filter(m=>m.role==='USER');
  if(users.length!==1)return null;
  const match=/^(?:explain|describe|define|what is)\s+([\p{L}\p{N}._-]{2,64})[?.]?$/iu.exec(users[0].text.trim());
  if(!match)return null;
  const entity=match[1],question=input.original.text.replace(/\bits\b/iu,entity);
  return validatePlan({action:'ANSWER',standaloneQuestion:question,intent:'RESEARCH',explicitConstraints:[],disclosedAssumptions:[],retrieval:{required:true,queries:[entity+' pricing'],freshness:'ANY',startDate:null,endDate:null},answerLanguage:input.locale??'en'},input);
 }catch{return null;}
}

export function clarifyUnresolvedReference(value:unknown):QueryPlan|null{
 try{
  const input=plannerInputSchema.parse(value);if(input.context.length)return null;
  const text=input.original.text.trim().replace(/\s+/gu,' ');
  const comparing=/^(?:is it better|compare (?:them|these|those)|which one should I use)\??$/iu.test(text);
  const pricing=/^(?:what|how) about (?:its|their) (?:pricing|costs?|features?)\??$/iu.test(text);
  const current=/^is (?:that|this|it) (?:current|accurate)\??$/iu.test(text);
  if(!comparing&&!pricing&&!current)return null;
  return queryPlanSchema.parse({action:'CLARIFY',question:comparing?'Which products are you comparing?':pricing?'Which product or service do you mean?':'Which information or topic do you mean?',reasonCode:'AMBIGUOUS_REFERENCE'});
 }catch{return null;}
}
