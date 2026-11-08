import {z} from 'zod';
import {queryPlanSchema,type QueryPlan} from '@/server/contracts/pipeline';
import {MAX_SUBMISSION_BYTES,localeSchema,questionTextSchema,timezoneSchema} from '@/server/contracts/chat';
import {safeEvidenceText} from '@/server/search/evidence';
import {freshnessTimeRange} from '@/server/search/freshness';
export const PLANNING_VERSION="planner-v6";
export const PLANNER_LIMITS=Object.freeze({contextMessages:6,inputBytes:MAX_SUBMISSION_BYTES,wireBytes:23000,queryCount:1,clarificationCharacters:240});
const turn=z.strictObject({id:z.uuid(),role:z.enum(['USER','ASSISTANT']),text:questionTextSchema});
// files: titles of the PDFs attached to this question. References such as "this report" mean them.
const plannerInputShape=z.strictObject({original:z.strictObject({id:z.uuid(),text:questionTextSchema}),context:z.array(turn).max(6),now:z.iso.datetime(),timezone:timezoneSchema,locale:localeSchema.nullable(),files:z.array(z.string().min(1).max(200)).min(1).max(5).optional()});
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
// Fixed codes only: these reach logs, so they never carry provider or user text.
export const PLANNER_FAILURES=['INPUT_INVALID','NOT_DISPATCHED','TIMEOUT','HTTP_ERROR','TRANSPORT','PROVIDER_REFUSED','OUTPUT_NOT_JSON','OUTPUT_UNPARSEABLE','FINISH_REASON','PLAN_SCHEMA','PLAN_CLARIFY','PLAN_RETRIEVAL','PLAN_LOCALE','PLAN_CONSTRAINT','PLAN_VOCABULARY','PLAN_ANCHOR','PLAN_NEGATION','PLAN_REFERENCE','PLAN_QUERY_INTENT','PLAN_FRESHNESS','UNKNOWN'] as const;
export type PlannerFailure=typeof PLANNER_FAILURES[number];
export class PlanningError extends Error{constructor(readonly reason:PlannerFailure='UNKNOWN',readonly httpStatus?:number){super('Planning unavailable');}}
const genericWords=new Set(('a an and are as at about be between by can compare comparison cost costs current date dates describe differences do does explain explanation fact facts features find for from general give how in information is latest me of official on or overview plans please price prices pricing question recent research resources results review search sources than the their them then these they this those to topic use using vs versus was were what when where which why with without work works you your it its that one ones into details summary summarize provide tell more examples difference brief briefly concise sentence sentences word words').split(' '));
const words=(text:string)=>(text.normalize('NFKC').replace(/[’‘]/gu,"'").toLowerCase().match(/[\p{L}\p{N}]+(?:[._'-][\p{L}\p{N}]+)*/gu)??[]).map(word=>word.replace(/'s$/u,''));
const numeric=(text:string)=>text.normalize('NFKC').match(/\d+(?:[.,/-]\d+)*/gu)?.map(v=>v.replaceAll(',',''))??[];
const referenceWords=new Set('it its they their them that this these those former latter'.split(' '));
function hasReference(text:string){
 const normalized=text.replace(/\bthis (?:week|month|year)\b/giu,'');
 return words(normalized).some(word=>referenceWords.has(word))||/\b(?:which|the|other) ones?\b/iu.test(normalized);
}
// Presentation requests belong in the answer but are not search subjects. Strip
// only explicit trailing instructions, never topic adjectives such as short bonds.
function searchSubject(text:string){
 return text.replace(/[?.!]\s*(?:give|provide|write) (?:a )?(?:short|brief|concise) (?:explanation|answer|summary)(?: with (?:reliable |credible |official )?sources)?[.!]?$/iu,'');
}
function pricingReferenceEntity(input:PlannerInput):string|null{
 const users=input.context.filter(m=>m.role==='USER');
 const candidates=users.length?users:input.context;
 if(candidates.length!==1)return null;
 const text=candidates[0].text.trim();
 const match=candidates[0].role==='USER'
  ? /^(?:explain|describe|define|what is)\s+([\p{L}\p{N}._-]{2,64})[?.]?$/iu.exec(text)
  : /^([\p{L}\p{N}._-]{2,64}) is\s/iu.exec(text);
 return match?.[1]??null;
}
const negative=/\b(?:not|no|without|exclude|excluding|avoid|except|never|don't|doesn't)\b/giu;
const clarificationWords=new Set('product products service services comparing mean refer referring information topic topics requirements requirement important matters matter aspect aspects options option criteria priorities priority goals goal purpose needs need looking clarify specify range location timeframe time region country currency audience case cases main budget workload constraints type detail details consider intended'.split(' '));
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
// With attached files the files are the subject, so a question with no topic words of its
// own ("Summarize this") is still answerable; every other constraint check still applies.
function requireQueryIntent(plan:Extract<QueryPlan,{action:'ANSWER'}>,original:string,files=false,fileWords:Set<string>=new Set()){
 const exclusions=original.split(/[,;!?]|\.(?:\s|$)/u).flatMap(clause=>{
  const offset=clause.search(negative);return offset<0?[]:[clause.slice(offset)];
 });
 const budgets=original.match(/\b(?:budget|under|below|maximum|max|minimum|min|at most|at least|up to|less than|more than|within)\s*(?:(?:USD|INR|EUR|GBP|Rs)\s*)?[$₹€£]?\s*\d+(?:[.,]\d+)*/giu)??[];
 const material=[...exclusions,...budgets],constraintWords=new Set(material.flatMap(words));
 // Words only from a file's name aren't search topics: queries may not carry them.
 const topics=words(searchSubject(plan.standaloneQuestion)).filter(word=>!genericWords.has(word)&&!constraintWords.has(word)&&!/^\d/u.test(word)&&!['recommend','recommendation','best'].includes(word)&&!(fileWords.has(word)&&!words(original).includes(word)));
 const queryWords=plan.retrieval.queries.map(query=>new Set(words(query))),allWords=new Set(queryWords.flatMap(set=>[...set]));
 if(!topics.length&&!files||topics.some(topic=>!allWords.has(topic)))throw new PlanningError('PLAN_QUERY_INTENT');
 for(const [index,query] of plan.retrieval.queries.entries()){
  if(topics.length&&!topics.some(topic=>queryWords[index].has(topic))||material.some(value=>words(value).some(word=>!queryWords[index].has(word))||[...value.matchAll(/[$₹€£]/gu)].some(match=>!query.includes(match[0]))))throw new PlanningError('PLAN_QUERY_INTENT');
 }
 // Subject numbers may be split (e.g. React 18 / React 19); shared budgets and
 // exclusions above stay on every query. Other original numbers remain covered.
 if(numeric(original).some(number=>!plan.retrieval.queries.some(query=>numeric(query).includes(number))))throw new PlanningError('PLAN_QUERY_INTENT');
}
// Conservative provenance validation, not a semantic-equivalence or safety proof.
// Actual outbound queries still pass local boundary checks before search.
export function validatePlan(value:unknown,input:unknown,maxQueries:number=PLANNER_LIMITS.queryCount):QueryPlan{
 try{
  const original=plannerInputSchema.parse(input),plan=queryPlanSchema.parse(value);
  const resolving=hasReference(original.original.text),files=original.files??[];
  const context=resolving?original.context:[];
  const users=[original.original,...context.filter(m=>m.role==='USER')];
  // The rewritten question may name an attached file ("aurora-water-report.pdf" gives aurora,
  // water and report), but a search query may only use the user's own words, so a file's name
  // never reaches web search unless the user wrote it.
  const userVocabulary=new Set(words([original.original.text,...context.map(m=>m.text)].join(' ')));
  const fileWords=new Set(words([...files,...files.map(file=>file.replace(/[._-]+/gu,' '))].join(' ')));
  const vocabulary=new Set([...userVocabulary,...fileWords]);
  const userNumbers=new Set(users.flatMap(m=>numeric(m.text)));
  if(plan.action==='CLARIFY'){
   // With attached files the question is about them; asking "which document?" would be wrong.
   if(files.length)throw new PlanningError('PLAN_CLARIFY');
   if(standaloneFallback(original)||resolvePricingFollowup(original))throw new PlanningError('PLAN_CLARIFY');
   if(plan.question.length>240||(plan.question.match(/\?/gu)?.length??0)>1||/[\r\n]/u.test(plan.question)||!safeEvidenceText(plan.question)||/https?:|www\./iu.test(plan.question))throw new PlanningError('PLAN_CLARIFY');
   if(words(plan.question).some(word=>!vocabulary.has(word)&&!genericWords.has(word)&&!clarificationWords.has(word))||numeric(plan.question).some(n=>!userNumbers.has(n)))throw new PlanningError('PLAN_CLARIFY');
   return freeze(plan);
  }
  if(![1,2].includes(maxQueries)||!plan.retrieval.required||plan.retrieval.queries.length>maxQueries||plan.disclosedAssumptions.length)throw new PlanningError('PLAN_RETRIEVAL');
  if(Intl.getCanonicalLocales(plan.answerLanguage)[0]!==Intl.getCanonicalLocales(original.locale??'en')[0])throw new PlanningError('PLAN_LOCALE');
  for(const constraint of plan.explicitConstraints){
   const source=users.find(m=>m.id===constraint.sourceMessageId);
   if(constraint.name!=='EXPLICIT'||!source||!source.text.includes(constraint.value))throw new PlanningError('PLAN_CONSTRAINT');
  }
  if(/^what about its pricing\??$/iu.test(original.original.text.trim())&&!pricingReferenceEntity(original))throw new PlanningError('PLAN_REFERENCE');
  const outside=(text:string,allowed:Set<string>)=>!safeEvidenceText(text)||words(text).some(word=>!allowed.has(word)&&!genericWords.has(word))||numeric(text).some(n=>!userNumbers.has(n));
  if(outside(plan.standaloneQuestion,vocabulary)||plan.retrieval.queries.some(query=>outside(query,userVocabulary)))throw new PlanningError('PLAN_VOCABULARY');
  // Rewrites cannot erase explicit negation, numeric limits or named user topics.
  const standaloneWords=new Set(words(plan.standaloneQuestion));
  const anchors=words(original.original.text).filter(w=>!genericWords.has(w));
  if(anchors.some(w=>!standaloneWords.has(w))||numeric(original.original.text).some(n=>!numeric(plan.standaloneQuestion).includes(n)))throw new PlanningError('PLAN_ANCHOR');
  for(const negation of original.original.text.match(negative)??[])if(!standaloneWords.has(negation.toLowerCase()))throw new PlanningError('PLAN_NEGATION');
  if(hasReference(original.original.text)){
   if(!files.length){
    if(!original.context.length)throw new PlanningError('PLAN_REFERENCE');
    const previous=new Set(original.context.flatMap(m=>words(m.text)).filter(w=>!genericWords.has(w)));
    if(!words(plan.standaloneQuestion).some(w=>previous.has(w))||hasReference(plan.standaloneQuestion))throw new PlanningError('PLAN_REFERENCE');
   }else if(original.context.length){
    // A follow-up with files may mean the files or an earlier turn; it must resolve to one of them.
    const previous=new Set([...original.context.flatMap(m=>words(m.text)),...fileWords].filter(w=>!genericWords.has(w)));
    if(!words(plan.standaloneQuestion).some(w=>previous.has(w)))throw new PlanningError('PLAN_REFERENCE');
   }
  }
  requireQueryIntent(plan,original.original.text,files.length>0,fileWords);
  if(plan.retrieval.freshness==='RECENT'&&!freshnessTimeRange(users.map(m=>m.text).join(' ')))throw new PlanningError('PLAN_FRESHNESS');
  if(plan.retrieval.freshness==='SPECIFIC_RANGE'&&![plan.retrieval.startDate,plan.retrieval.endDate].every(date=>users.some(m=>m.text.includes(date!))))throw new PlanningError('PLAN_FRESHNESS');
  return freeze(plan);
 }catch(error){throw error instanceof PlanningError?error:new PlanningError('PLAN_SCHEMA');}
}
export function standaloneFallback(value:unknown):QueryPlan|null{
 try{
  const input=plannerInputSchema.parse(value),text=input.original.text;
  const compare=/^compare\s+\S[\s\S]{0,240}\s+(?:and|vs\.?|versus)\s+\S/iu.test(text.trim());
  if(text.length>300||hasReference(text)||/\b(?:best|better|recommend)\b/iu.test(text)||!compare&&!/^(?:explain|define|describe|why (?:do|does|is)|how (?:do|does)|what (?:is|are|causes))\s+\S+/iu.test(text.trim()))return null;
  return exactOriginalPlan(input,compare?'COMPARE':'EXPLAIN');
 }catch{return null;}
}
function exactOriginalPlan(input:PlannerInput,intent:'COMPARE'|'EXPLAIN'|'RESEARCH'){
 const text=input.original.text;
 return validatePlan({action:'ANSWER',standaloneQuestion:text,intent,explicitConstraints:[],disclosedAssumptions:[],retrieval:{required:true,queries:[text],freshness:freshnessTimeRange(text)?'RECENT':'ANY',startDate:null,endDate:null},answerLanguage:input.locale??'en'},input);
}
// Only for when the model call has already failed: searching the user's exact words
// beats failing the run. It's limited to a conversation's first question because a
// FAST answer doesn't see earlier turns, and no word list can reliably tell a follow-up
// ("Who founded the company?") from a new question. Wrongly guessing gives a confident
// answer about the wrong subject, which is worse than a failed run the user can retry.
export function literalQuestionPlan(value:unknown):QueryPlan|null{
 try{
  const input=plannerInputSchema.parse(value),text=input.original.text;
  const topics=new Set(words(text).filter(word=>!genericWords.has(word)));
  if(input.context.length||text.length>300||hasReference(text)||topics.size<2)return null;
  return exactOriginalPlan(input,'RESEARCH');
 }catch{return null;}
}

// With attached files, the user's exact words are a safe plan when nothing but their own files
// is searched (filesOnly), or on a conversation's first question, where "this report" can only
// mean the files. Like literalQuestionPlan, it never guesses at a follow-up that reaches the web.
export function attachedFilesPlan(value:unknown,filesOnly:boolean):QueryPlan|null{
 try{
  const input=plannerInputSchema.parse(value);
  if(!input.files?.length||input.original.text.length>300||input.context.length&&!filesOnly)return null;
  return exactOriginalPlan(input,'RESEARCH');
 }catch{return null;}
}
// Whether a query has anything to search the web for. "Summarize this" doesn't: with files
// attached it is about them, so a Web question like it searches only the files.
export function hasSearchTopic(query:string){
 return words(searchSubject(query)).some(word=>!genericWords.has(word)&&!/^\d/u.test(word)&&!['recommend','recommendation','best'].includes(word));
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
  const input=plannerInputSchema.parse(value);
  if(input.files?.length)return null;
  if(input.context.length){
   if(!/^(?:what|how) about its pricing\??$/iu.test(input.original.text.trim())||pricingReferenceEntity(input))return null;
   return queryPlanSchema.parse({action:'CLARIFY',question:'Which product or service do you mean?',reasonCode:'AMBIGUOUS_REFERENCE'});
  }
  const text=input.original.text.trim().replace(/\s+/gu,' ');
  const comparing=/^(?:is it better|compare (?:them|these|those)|which one should I use|which (?:one|ones) (?:is|are) (?:faster|better))\??$/iu.test(text);
  const pricing=/^(?:what|how) about (?:its|their) (?:pricing|costs?|features?)\??$/iu.test(text);
  const current=/^is (?:that|this|it) (?:current|accurate)\??$/iu.test(text);
  if(!comparing&&!pricing&&!current)return null;
  return queryPlanSchema.parse({action:'CLARIFY',question:comparing?'Which products are you comparing?':pricing?'Which product or service do you mean?':'Which information or topic do you mean?',reasonCode:'AMBIGUOUS_REFERENCE'});
 }catch{return null;}
}
