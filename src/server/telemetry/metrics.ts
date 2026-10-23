import {metrics} from '@opentelemetry/api';
import {outcomeCategory,telemetryFieldsSchema,stageSchema,type TelemetryEvent} from './contracts';
// IDs, versions, model names and category arrays belong only in correlated logs/spans.
export function metricDimensions(value:unknown) {
 const fields=telemetryFieldsSchema.parse(value),stage=stageSchema.safeParse((value as {stage?:unknown})?.stage);
 const outcome=fields.outcome??'SUCCEEDED';
 return {stage:stage.success?stage.data:'run.execute',outcome,category:outcomeCategory(outcome)};
}
function createInstruments() {
 const meter=metrics.getMeter('perplex.research','1');
 return {operations:meter.createCounter('research.operations',{description:'Completed stages by fixed outcome'}),
  duration:meter.createHistogram('research.stage.duration',{unit:'ms',advice:{explicitBucketBoundaries:[10,50,100,250,500,1000,2000,5000,8000,12000,20000,45000]}}),
  progress:meter.createHistogram('research.first_progress.duration',{unit:'ms'}),delivery:meter.createHistogram('research.approved_delivery.duration',{unit:'ms'}),
  safety:meter.createCounter('research.safety.decisions'),
  inputTokens:meter.createCounter('research.provider.input_tokens'),outputTokens:meter.createCounter('research.provider.output_tokens'),searchCredits:meter.createCounter('research.provider.search_credits'),
  cost:meter.createCounter('research.provider.known_micro_usd'),unknown:meter.createCounter('research.provider.unknown_calls')};
}
let instruments:ReturnType<typeof createInstruments>|undefined;
export function recordMetrics(event:TelemetryEvent) {
 try {
  const m=instruments??=createInstruments(),dimensions=metricDimensions(event);
  if(event.event==='research.span'&&event.phase==='END'){
   m.operations.add(1,dimensions);if(event.durationMs!==undefined)m.duration.record(event.durationMs,dimensions);
  }
  if(event.event==='research.safety')m.safety.add(1,dimensions);
  if(event.durationMs!==undefined){
   if(event.event==='research.first_progress')m.progress.record(event.durationMs,dimensions);
   if(event.event==='research.approved_delivery')m.delivery.record(event.durationMs,dimensions);
  }
  if(event.event==='research.usage'&&event.providerCallId){
   const usage={stage:event.providerStage??'ANSWER',outcome:event.outcome??'UNKNOWN'};
   for(const [counter,value] of [[m.inputTokens,event.inputTokens],[m.outputTokens,event.outputTokens],[m.searchCredits,event.searchCredits]] as const){if(value!==null&&value!==undefined)counter.add(value,usage);}
   if(event.knownCostMicroUsd!==undefined){const cost=Number(event.knownCostMicroUsd);if(Number.isSafeInteger(cost))m.cost.add(cost,usage);}
   if(event.costState!=='KNOWN')m.unknown.add(1,usage);
  }
 }catch{/* An exporter must not change execution, accounting or release decisions. */}
}
