import {z} from 'zod';
export const researchTime=z.strictObject({
 asOf:z.iso.date(),kind:z.enum(['EVERGREEN','CURRENT','HISTORICAL','FORECAST']),
 startDate:z.iso.date().nullable(),endDate:z.iso.date().nullable(),
 filterPublication:z.boolean(),basis:z.enum(['EXPLICIT','TOPIC','DEFAULT']),
}).refine(v=>(v.startDate===null)===(v.endDate===null)&&(!v.startDate||v.startDate<=v.endDate!));
export type ResearchTime=z.infer<typeof researchTime>;
const iso=(date:Date)=>date.toISOString().slice(0,10);
const dayMs=86400000;
function validDate(value:string){const parsed=z.iso.date().safeParse(value);if(!parsed.success||iso(new Date(value))!==value)throw Error('Invalid research date');return value;}
// Resolve once at admission, in UTC, then persist. A recovered job must not drift
// into a new day. Event dates and publication dates are deliberately distinct.
export function resolveResearchTime(question:string,now:Date):ResearchTime{
 const asOf=iso(now),today=new Date(asOf),year=today.getUTCFullYear(),month=today.getUTCMonth();
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
 const forecast=/\b(?:forecast|predict|projection|outlook|next year|next month)\b/iu.test(question)||!!startDate&&startDate>asOf;
 if(forecast)return researchTime.parse({asOf,kind:'FORECAST',startDate:null,endDate:null,filterPublication:false,basis:'EXPLICIT'});
 if(startDate)return researchTime.parse({asOf,kind:endDate!<asOf?'HISTORICAL':'CURRENT',startDate,endDate,filterPublication:/\b(?:published|publication|news|articles dated)\b/iu.test(question),basis:'EXPLICIT'});
 const temporal=question.replace(/\b(?:(?:electric(?:al)?|alternating|direct|ocean|water|air) currents?|current (?:flow|density|voltage|resistance))\b/giu,'');
 const explicit=/\b(?:latest|recent|current|now)\b/iu.test(temporal);
 const changing=/\b(?:pricing|prices|availability|elections?|president|ceo|regulations?|laws?|policies|release|versions?|news|market|AI models?|LLMs?)\b/iu.test(temporal);
 return researchTime.parse({asOf,kind:explicit||changing?'CURRENT':'EVERGREEN',startDate:null,endDate:null,filterPublication:false,basis:explicit?'EXPLICIT':changing?'TOPIC':'DEFAULT'});
}
export function timeInstructions(time:ResearchTime){return JSON.stringify({...time,instruction:'Use this frozen temporal scope. Distinguish event dates, publication dates and retrieval dates. Current topics require current primary evidence; older authoritative background may still apply. Forecasts are uncertain, never observed facts. Disclose missing or undated evidence; never claim a source was verified current merely because it was retrieved today.'});}
