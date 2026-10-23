import {AsyncLocalStorage} from 'node:async_hooks';
import {randomBytes} from 'node:crypto';
import {trace,ROOT_CONTEXT,SpanStatusCode,isSpanContextValid,type Attributes,type Context,type Span,type SpanContext} from '@opentelemetry/api';
import {AdmissionError} from '@/server/runs/errors';
import {telemetryEventSchema,telemetryFieldsSchema,providerTelemetryFieldsSchema,runMetadataSchema,outcomeSchema,outcomeCategory,type TelemetryEvent,type TelemetryFields,type TelemetryStage} from './contracts';
import {recordMetrics} from './metrics';
type Scope={requestId:string;traceId:string;spanId:string;parentSpanId?:string;stage?:TelemetryStage;apiContext:Context;run:Partial<zRun>;calls:Map<string,TelemetryFields>;sink:(event:TelemetryEvent)=>void};
type zRun=ReturnType<typeof runMetadataSchema.parse>;
const storage=new AsyncLocalStorage<Scope>();
const hex=(bytes:number)=>randomBytes(bytes).toString('hex');
const attributes=(fields:Record<string,unknown>):Attributes=>Object.fromEntries(Object.entries(fields).filter((entry):entry is [string,string|number|string[]]=>typeof entry[1]==='string'||typeof entry[1]==='number'||Array.isArray(entry[1])&&entry[1].every(v=>typeof v==='string')));
export function withTelemetry<T>(requestId:string,work:()=>Promise<T>,sink:(event:TelemetryEvent)=>void=event=>console.info(JSON.stringify(event))):Promise<T> {
 const traceId=hex(16),spanId=hex(8);
 return storage.run({requestId,traceId,spanId,apiContext:ROOT_CONTEXT,run:{},calls:new Map(),sink},()=>traceStage('http.request',work));
}
export function bindRunTelemetry(value:unknown) {
 const current=storage.getStore(),parsed=runMetadataSchema.safeParse(value);
 if(current&&parsed.success)Object.assign(current.run,parsed.data);
}
// A bounded observation of this execution, never a second billing ledger. Durable
// receipts/reconciliation remain in Postgres, including calls that finish later.
export function recordProviderObservation(value:unknown,started=false) {
 const current=storage.getStore(),parsed=providerTelemetryFieldsSchema.safeParse(value);if(!current||!parsed.success)return;
 const fields=parsed.data;if(!fields.providerCallId||!fields.providerStage)return;
 if(!current.calls.has(fields.providerCallId)&&current.calls.size>=6)return;
 const observation={...current.calls.get(fields.providerCallId),...fields};
 current.calls.set(fields.providerCallId,observation);
 recordTelemetry(started?'research.provider_started':'research.usage',observation);
}
export function recordRunUsage() {
 const current=storage.getStore();if(!current)return;
 const calls=[...current.calls.values()],models=calls.filter(c=>c.providerStage!=='SEARCH');
 const known=calls.reduce((n,c)=>n+BigInt(c.knownCostMicroUsd??'0'),0n),unknown=calls.filter(c=>c.costState!=='KNOWN').length;
 const tokens=(key:'inputTokens'|'outputTokens')=>models.some(c=>c[key]!=null)?models.reduce((n,c)=>n+(c[key]??0),0):models.length?null:0;
 recordTelemetry('research.run_usage',{knownCostMicroUsd:String(known),costState:unknown?known>0n?'PARTIAL':'UNKNOWN':'KNOWN',unknownCalls:unknown,inputTokens:tokens('inputTokens'),outputTokens:tokens('outputTokens'),
  searchCredits:calls.some(c=>c.providerStage==='SEARCH'&&c.outcome!=='SKIPPED'&&c.searchCredits==null)?null:calls.reduce((n,c)=>n+(c.searchCredits??0),0)});
}
export function recordTelemetry(event:TelemetryEvent['event'],value:unknown={}) {
 const current=storage.getStore();if(!current)return;
 try {
  const fields=telemetryFieldsSchema.safeParse(value);if(!fields.success)return;
  const parsed=telemetryEventSchema.parse({...fields.data,...current.run,event,schemaVersion:1,timestamp:new Date().toISOString(),requestId:current.requestId,traceId:current.traceId,spanId:current.spanId,parentSpanId:current.parentSpanId,stage:current.stage});
  try{void Promise.resolve(current.sink(parsed)).catch(()=>{});}catch{/* Logging is best effort; the ledger is authoritative. */}
  recordMetrics(parsed);
 }catch{/* Never emit validation errors or the rejected object. */}
}
function inferredOutcome(value:unknown) {
 if(value&&typeof value==='object'){
  const result=value as {kind?:unknown;code?:unknown};
  const parsed=outcomeSchema.safeParse(result.kind==='DENIED'?result.code:result.kind);
  if(parsed.success)return parsed.data;
 }
 return 'SUCCEEDED' as const;
}
export async function traceStage<T>(stage:TelemetryStage,work:()=>Promise<T>,fields?:(result:T)=>TelemetryFields):Promise<T> {
 const parent=storage.getStore();if(!parent)return work();
 let span:Span|undefined;
 try{span=trace.getTracer('perplex.research','1').startSpan(stage,{attributes:{'request.id':parent.requestId,...parent.run}},parent.apiContext);}catch{/* No exporter can veto work. */}
 let valid:SpanContext|undefined;
 try{const sc=span?.spanContext();if(sc&&isSpanContextValid(sc)&&sc.spanId!==trace.getSpanContext(parent.apiContext)?.spanId)valid=sc;}catch{}
 const scope:Scope={...parent,traceId:valid?.traceId??parent.traceId,spanId:valid?.spanId??hex(8),parentSpanId:parent.stage?parent.spanId:undefined,stage,apiContext:span&&valid?trace.setSpan(parent.apiContext,span):parent.apiContext};
 return storage.run(scope,async()=>{
  const started=performance.now();
  const emit=(phase:'START'|'END',details:TelemetryFields={})=>{
   const parsed=telemetryFieldsSchema.safeParse(details);if(!parsed.success)return;
   // phase is set only here, never accepted from caller/provider fields.
   try{const event=telemetryEventSchema.parse({...parsed.data,...scope.run,event:'research.span',schemaVersion:1,timestamp:new Date().toISOString(),requestId:scope.requestId,traceId:scope.traceId,spanId:scope.spanId,parentSpanId:scope.parentSpanId,stage,phase});try{void Promise.resolve(scope.sink(event)).catch(()=>{});}catch{}recordMetrics(event);}catch{}
  };
  emit('START');let details:TelemetryFields={outcome:'ERROR'};
  try {
   const result=await work();details={outcome:inferredOutcome(result)};
   try{details={...details,...telemetryFieldsSchema.parse(fields?.(result)??{})};}catch{}
   return result;
  }catch(error){details={outcome:error instanceof AdmissionError?error.code:'ERROR',...(stage==='citations'?{reason:'CITATION_INVALID' as const}:{})};throw error;}
  finally{
   const durationMs=Math.max(0,Math.round(performance.now()-started));emit('END',{...details,durationMs});
   try{span?.setAttributes(attributes({...scope.run,...details,durationMs}));if(['infrastructure','deadline'].includes(outcomeCategory(details.outcome??'ERROR')))span?.setStatus({code:SpanStatusCode.ERROR});}catch{}
   try{span?.end();}catch{}
  }
 });
}
