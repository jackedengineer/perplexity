import {AsyncLocalStorage} from 'node:async_hooks';
import {randomBytes} from 'node:crypto';
import {context,trace,SpanStatusCode,isSpanContextValid,type Attributes,type Context,type Span} from '@opentelemetry/api';
import {AdmissionError} from '@/server/runs/errors';
import {telemetryEventSchema,telemetryFieldsSchema,runMetadataSchema,outcomeSchema,type TelemetryEvent,type TelemetryFields,type TelemetryStage} from './contracts';
import {recordMetrics} from './metrics';
type Scope={requestId:string;traceId:string;spanId:string;parentSpanId?:string;stage?:TelemetryStage;apiContext:Context;run:Partial<zRun>;sink:(event:TelemetryEvent)=>void};
type zRun=ReturnType<typeof runMetadataSchema.parse>;
const storage=new AsyncLocalStorage<Scope>();
const hex=(bytes:number)=>randomBytes(bytes).toString('hex');
const attributes=(fields:Record<string,unknown>):Attributes=>Object.fromEntries(Object.entries(fields).filter((entry):entry is [string,string|number|string[]]=>typeof entry[1]==='string'||typeof entry[1]==='number'||Array.isArray(entry[1])&&entry[1].every(v=>typeof v==='string')));
export function withTelemetry<T>(requestId:string,work:()=>T,sink:(event:TelemetryEvent)=>void=event=>console.info(JSON.stringify(event))):T {
 return storage.run({requestId,traceId:hex(16),spanId:hex(8),apiContext:context.active(),run:{},sink},work);
}
export function bindRunTelemetry(value:unknown) {
 const current=storage.getStore(),parsed=runMetadataSchema.safeParse(value);
 if(current&&parsed.success)current.run=parsed.data;
}
export function recordTelemetry(event:TelemetryEvent['event'],value:unknown={}) {
 const current=storage.getStore();if(!current)return;
 try {
  const fields=telemetryFieldsSchema.safeParse(value);if(!fields.success)return;
  const parsed=telemetryEventSchema.parse({...fields.data,...current.run,event,schemaVersion:1,timestamp:new Date().toISOString(),requestId:current.requestId,traceId:current.traceId,spanId:current.spanId,parentSpanId:current.parentSpanId,stage:current.stage});
  try{current.sink(parsed);}catch{/* Logging is best effort; the ledger is authoritative. */}
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
 const sc=span?.spanContext(),valid=sc&&isSpanContextValid(sc);
 const scope:Scope={...parent,traceId:valid?sc.traceId:parent.traceId,spanId:valid?sc.spanId:hex(8),parentSpanId:parent.stage?parent.spanId:undefined,stage,apiContext:span?trace.setSpan(parent.apiContext,span):parent.apiContext};
 return storage.run(scope,async()=>{
  const started=performance.now();
  const emit=(phase:'START'|'END',details:TelemetryFields={})=>{
   const parsed=telemetryFieldsSchema.safeParse(details);if(!parsed.success)return;
   // phase is set only here, never accepted from caller/provider fields.
   try{const event=telemetryEventSchema.parse({...parsed.data,...scope.run,event:'research.span',schemaVersion:1,timestamp:new Date().toISOString(),requestId:scope.requestId,traceId:scope.traceId,spanId:scope.spanId,parentSpanId:scope.parentSpanId,stage,phase});try{scope.sink(event);}catch{}recordMetrics(event);}catch{}
  };
  emit('START');let details:TelemetryFields={outcome:'ERROR'};
  try {
   const result=await work();details={outcome:inferredOutcome(result)};
   try{details={...details,...telemetryFieldsSchema.parse(fields?.(result)??{})};}catch{}
   return result;
  }catch(error){details={outcome:error instanceof AdmissionError?error.code:'ERROR'};throw error;}
  finally{
   const durationMs=Math.max(0,Math.round(performance.now()-started));emit('END',{...details,durationMs});
   try{span?.setAttributes(attributes({...scope.run,...details,durationMs}));if(details.outcome==='ERROR')span?.setStatus({code:SpanStatusCode.ERROR});span?.end();}catch{}
  }
 });
}
