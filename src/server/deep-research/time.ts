import {z} from 'zod';
export const researchTime=z.strictObject({
 asOf:z.iso.date(),referenceAt:z.iso.datetime().optional(),kind:z.enum(['EVERGREEN','CURRENT','HISTORICAL','FORECAST']),
 startDate:z.iso.date().nullable(),endDate:z.iso.date().nullable(),
 publicationStartDate:z.iso.date().nullable().optional(),publicationEndDate:z.iso.date().nullable().optional(),
 filterPublication:z.boolean(),basis:z.enum(['EXPLICIT','TOPIC','DEFAULT']),
}).refine(v=>(v.startDate===null)===(v.endDate===null)&&(!v.startDate||v.startDate<=v.endDate!)&&(!v.publicationStartDate===!v.publicationEndDate)&&(!v.publicationStartDate||v.publicationStartDate<=v.publicationEndDate!));
export type ResearchTime=z.infer<typeof researchTime>;
const iso=(date:Date)=>date.toISOString().slice(0,10);
const dayMs=86400000;
function validDate(value:string){const parsed=z.iso.date().safeParse(value);if(!parsed.success||iso(new Date(value))!==value)throw Error('Invalid research date');return value;}
// Resolve once at admission, in UTC, then persist. A recovered job must not drift
// into a new day. Event dates and publication dates are deliberately distinct.
function resolveSingleScope(question:string,now:Date):ResearchTime{
 const referenceAt=now.toISOString(),asOf=iso(now),today=new Date(asOf),year=today.getUTCFullYear(),month=today.getUTCMonth();
 let startDate:string|null=null,endDate:string|null=null;
 const dates=[...question.matchAll(/\b\d{4}-\d{2}-\d{2}\b/gu)].map(m=>validDate(m[0]));
 if(dates.length>2)throw Error('Use one research date range');
 if(dates.length){[startDate,endDate]=[dates[0],dates[1]??dates[0]];}
 else if(/\byesterday\b/iu.test(question))startDate=endDate=iso(new Date(+today-dayMs));
 else if(/\btoday\b/iu.test(question))startDate=endDate=asOf;
 else if(/\b(?:last|this) week\b/iu.test(question)){
  const monday=+today-((today.getUTCDay()+6)%7)*dayMs,last=/\blast week\b/iu.test(question);
  startDate=iso(new Date(monday-(last?7:0)*dayMs));endDate=last?iso(new Date(monday-dayMs)):asOf;
 }else if(/\b(?:last|this) month\b/iu.test(question)){
  const last=/\blast month\b/iu.test(question);startDate=iso(new Date(Date.UTC(year,month-(last?1:0),1)));endDate=last?iso(new Date(Date.UTC(year,month,0))):asOf;
 }else{
  const range=question.match(/\b(?:from|between)\s+((?:19|20)\d{2})\s+(?:to|and|through)\s+((?:19|20)\d{2})\b/iu);
  const single=question.match(/\b(?:in|during|year|as of)\s+((?:19|20)\d{2})\b/iu);
  if(range){startDate=range[1]+'-01-01';endDate=range[2]+'-12-31';}
  else if(single){startDate=single[1]+'-01-01';endDate=single[1]===String(year)?asOf:single[1]+'-12-31';}
 }
 if(startDate&&endDate&&startDate>endDate)throw Error('Reversed research range');
 const publication=/\b(?:published|publication|news|articles dated)\b/iu.test(question);
 // An explicit past/current publication window remains authoritative even when
 // the subject is a forecast. Future target dates cannot filter existing sources.
 if(startDate&&startDate<=asOf)return researchTime.parse({asOf,referenceAt,kind:/\b(?:next year|next month)\b/iu.test(question)?'FORECAST':endDate!<asOf?'HISTORICAL':'CURRENT',startDate,endDate,filterPublication:publication,basis:'EXPLICIT'});
 const forecast=/\b(?:forecast|predict|projection|outlook|next year|next month)\b/iu.test(question)||!!startDate&&startDate>asOf;
 if(forecast)return researchTime.parse({asOf,referenceAt,kind:'FORECAST',startDate:null,endDate:null,filterPublication:false,basis:'EXPLICIT'});
 const temporal=question.replace(/\b(?:(?:electric(?:al)?|alternating|direct|ocean|water|air) currents?|current (?:flow|density|voltage|resistance))\b/giu,'');
 const explicit=/\b(?:latest|recent|current|now)\b/iu.test(temporal);
 const changing=/\b(?:pricing|prices|availability|elections?|president|ceo|regulations?|laws?|policies|release|versions?|news|market|AI models?|LLMs?)\b/iu.test(temporal);
 return researchTime.parse({asOf,referenceAt,kind:explicit||changing?'CURRENT':'EVERGREEN',startDate:null,endDate:null,filterPublication:false,basis:explicit?'EXPLICIT':changing?'TOPIC':'DEFAULT'});
}
// Resolve the publication clause independently; dates describing the event must
// never become a publication filter simply because "published" occurs elsewhere.
export function resolveResearchTime(question:string,now:Date):ResearchTime{
 const cue=/\b(?:published|publications?|articles dated|news dated)\b/iu.exec(question);
 if(!cue)return resolveSingleScope(question,now);
 const tail=question.slice(cue.index+cue[0].length);
 const boundary=/\b(?:about|covering|regarding|concerning|for events|on events|using|based on)\b|[;?]/iu.exec(tail);
 const publication=resolveSingleScope(boundary?tail.slice(0,boundary.index):tail,now);
 const event=resolveSingleScope(question.slice(0,cue.index)+(boundary?' '+tail.slice(boundary.index):''),now);
 const scope=event.startDate?event:/\b(?:predict|next year|next month)\b/iu.test(question)?{...publication,kind:'FORECAST' as const}:publication.startDate?publication:event.kind==='CURRENT'?event:publication;
 return researchTime.parse({...scope,filterPublication:!!publication.startDate,
  publicationStartDate:publication.startDate,publicationEndDate:publication.endDate});
}
export function timeInstructions(time:ResearchTime){return JSON.stringify({...time,instruction:'Use this frozen temporal scope. Distinguish event dates, publication dates and retrieval dates. Current topics require current primary evidence; older authoritative background may still apply. Forecasts are uncertain, never observed facts. Disclose missing or undated evidence; never claim a source was verified current merely because it was retrieved today.'});}
