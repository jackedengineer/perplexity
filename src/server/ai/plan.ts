import {z} from 'zod';
import {queryPlanSchema,type QueryPlan} from '@/server/contracts/pipeline';
import {localeSchema,questionTextSchema,timezoneSchema} from '@/server/contracts/chat';
import {safeEvidenceText} from '@/server/search/evidence';
export const PLANNER_LIMITS=Object.freeze({contextMessages:6,inputBytes:10000,queryCount:1,clarificationCharacters:240});
const turn=z.strictObject({id:z.uuid(),role:z.enum(['USER','ASSISTANT']),text:questionTextSchema});
export const plannerInputSchema=z.strictObject({original:z.strictObject({id:z.uuid(),text:questionTextSchema}),context:z.array(turn).max(6),now:z.iso.datetime(),timezone:timezoneSchema,locale:localeSchema.nullable()})
 .refine(value=>new Set([value.original.id,...value.context.map(m=>m.id)]).size===value.context.length+1&&Buffer.byteLength(JSON.stringify(value),'utf8')<=PLANNER_LIMITS.inputBytes);
export type PlannerInput=z.infer<typeof plannerInputSchema>;
export class PlanningError extends Error{constructor(){super('Planning unavailable');}}
const genericWords=new Set(('a an and are as at about be between by can compare comparison cost costs current date dates describe differences do does explain explanation fact facts features find for from general give how in information is latest me of official on or overview plans please price prices pricing question recent research resources results review search sources than the their them then these they this those to topic use using vs versus was were what when where which why with without work works you your it its that into brief briefly concise sentence sentences word words').split(' '));
const words=(text:string)=>text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+(?:[._'-][\p{L}\p{N}]+)*/gu)??[];
const numeric=(text:string)=>text.normalize('NFKC').match(/\d+(?:[.,/-]\d+)*/gu)?.map(v=>v.replaceAll(',',''))??[];
const references=/\b(?:it|its|they|their|them|that|this|these|those|former|latter)\b/iu;
const freshness=/\b(?:current|latest|recent|today|yesterday|this week|this month|last week|last month)\b|आज|नवीनतम|últim[oa]/iu;
const negative=/\b(?:not|no|without|exclude|excluding|avoid|except|never|don't|doesn't)\b/giu;
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
// Conservative provenance validation, not a semantic-equivalence or safety proof.
// Actual outbound queries still require the independent semantic safety gate.
export function validatePlan(value:unknown,input:unknown,maxQueries:number=PLANNER_LIMITS.queryCount):QueryPlan{
 try{
  const original=plannerInputSchema.parse(input),plan=queryPlanSchema.parse(value);
  if(plan.action==='CLARIFY'){
   if(plan.question.length>240||(plan.question.match(/\?/gu)?.length??0)>1||/[\r\n]/u.test(plan.question)||!safeEvidenceText(plan.question)||/https?:|www\./iu.test(plan.question))throw new PlanningError();
   return freeze(plan);
  }
  if(![1,2].includes(maxQueries)||!plan.retrieval.required||plan.retrieval.queries.length>maxQueries||plan.disclosedAssumptions.length)throw new PlanningError();
  const users=[original.original,...original.context.filter(m=>m.role==='USER')];
  for(const constraint of plan.explicitConstraints){
   const source=users.find(m=>m.id===constraint.sourceMessageId);
   if(constraint.name!=='EXPLICIT'||!source||!source.text.includes(constraint.value))throw new PlanningError();
  }
  const vocabulary=new Set(words([original.original.text,...original.context.map(m=>m.text)].join(' ')));
  const userNumbers=new Set(users.flatMap(m=>numeric(m.text)));
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
  if(plan.retrieval.freshness==='RECENT'&&!freshness.test(users.map(m=>m.text).join(' ')))throw new PlanningError();
  if(plan.retrieval.freshness==='SPECIFIC_RANGE'&&![plan.retrieval.startDate,plan.retrieval.endDate].every(date=>users.some(m=>m.text.includes(date!))))throw new PlanningError();
  return freeze(plan);
 }catch{throw new PlanningError();}
}
export function standaloneFallback(value:unknown):QueryPlan|null{
 try{
  const input=plannerInputSchema.parse(value),text=input.original.text;
  if(text.length>300||references.test(text)||/\b(?:best|better|recommend)\b/iu.test(text)||! /^(?:explain|define|describe|why (?:do|does|is)|how (?:do|does)|what (?:is|are))\s+\S+/iu.test(text.trim()))return null;
  return validatePlan({action:'ANSWER',standaloneQuestion:text,intent:'EXPLAIN',explicitConstraints:[],disclosedAssumptions:[],retrieval:{required:true,queries:[text],freshness:'ANY',startDate:null,endDate:null},answerLanguage:input.locale??'en'},input);
 }catch{return null;}
}
