import {isLocalSafetyGuard} from '@/server/safety/local';
import { and,eq,exists,sql } from "drizzle-orm";
import { providerCalls,runs,appUsers } from "@/db/schema";
import type { AdmissionDatabase } from "./usage";
import { lockOwnedRun } from "./lock";
import { AdmissionError } from "./errors";
import type { ProviderUsage } from "@/server/ai/usage";
import { SafetyProviderError,type SafetyProvider } from "@/server/safety/provider";
import type { SearchProvider } from "@/server/search/tavily";
import {TAVILY_CREDIT_MICRO_USD,providerDeadline,stageLimits,type ProviderStage} from './budgets';
import {recordProviderObservation,traceStage} from '@/server/telemetry/trace';
import {PlanningError} from '@/server/ai/plan';
const noUsage:ProviderUsage={costMicroUsd:0n,inputTokens:0,outputTokens:0,actualModel:null};
const tavilyUsage=(credits:number):ProviderUsage=>({costMicroUsd:BigInt(credits)*TAVILY_CREDIT_MICRO_USD,inputTokens:null,outputTokens:null,actualModel:null});
const phases = { PLANNER: "PLANNING",QUERY_SECOND:"SEARCHING",SEARCH_SECOND:"SEARCHING",EXTRACT:"PREPARING_EVIDENCE", INPUT_SAFETY: "CHECKING_INPUT",QUERY_SAFETY: "SEARCHING",SEARCH: "SEARCHING",EVIDENCE_SAFETY: "PREPARING_EVIDENCE",ANSWER: "GENERATING",OUTPUT_SAFETY: "CHECKING_OUTPUT",QUERY_EMBEDDING: "SEARCHING" };
export function createProviderCalls(db: AdmissionDatabase,subject: string,runId: string) {
  return {
    async begin(stage: ProviderStage,requestedModel: string,signal?:AbortSignal) {
      const startedAt=performance.now();
      if(signal?.aborted)throw new AdmissionError('CONFLICT');
      const claim=await db.transaction(async(tx)=>{
        const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
        const limits=stageLimits(run.accountingVersion,stage);
        if (!limits) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
        if(run.deadlineAt<=now)throw new AdmissionError('DEADLINE_EXCEEDED');
        if (signal?.aborted || run.status !== phases[stage] || run.attemptVersion!==1 || conversation.revision!==run.admittedRevision) throw new AdmissionError("CONFLICT");
        const [{ total,overages,repeats }] = await tx.select({repeats:sql<number>`count(*) filter (where ${providerCalls.stage}=${stage})::integer`,overages: sql<number>`count(*) filter (where ${providerCalls.costMicroUsd} > ${providerCalls.capMicroUsd})::integer`,total: sql<string>`coalesce(sum(${providerCalls.capMicroUsd}),0)::text` }).from(providerCalls).where(eq(providerCalls.runId,runId));
        if(repeats>0)throw new AdmissionError('RUN_IN_PROGRESS');
        if (overages > 0 || BigInt(total)+limits.capMicroUsd > run.providerReserveMicroUsd) throw new AdmissionError("BUDGET_EXCEEDED");
        const [call] = await tx.insert(providerCalls).values({ runId,stage,budgetVersion:run.accountingVersion,requestedModel,attemptVersion: run.attemptVersion,
          capMicroUsd: limits.capMicroUsd,status: "STARTED",startedAt: now }).returning({ id: providerCalls.id });
        return {id:call.id,deadlineAt:run.deadlineAt,maxDurationMs:limits.maxDurationMs,runRemainingMs:run.deadlineAt.getTime()-now.getTime()};
      });
      // The stage limit bounds the wait for the provider, so database time doesn't consume it. The absolute run deadline still counts everything.
      const observedAt=performance.now();
      recordProviderObservation({providerCallId:claim.id,providerStage:stage,modelId:/^[a-z0-9-]+\/[A-Za-z0-9._:-]+$/u.test(requestedModel)?requestedModel:undefined,outcome:"UNKNOWN",costState:"UNKNOWN",inputTokens:null,outputTokens:null,searchCredits:null},true);
      const runRemainingMs=claim.runRemainingMs-(observedAt-startedAt);
      return {id:claim.id,deadlineAt:claim.deadlineAt,remainingMs:Math.min(claim.maxDurationMs,runRemainingMs),runLimited:runRemainingMs<=claim.maxDurationMs,observedAt};
    },
    async finish(id: string,status: "SUCCEEDED" | "UNKNOWN" | "SKIPPED",usage?: ProviderUsage,searchCredits?: 0|1) {
      // A paid result may arrive after cancellation/fencing; record its cost without authorizing continuation.
      const owned = db.select({ id: runs.id }).from(runs).innerJoin(appUsers,eq(appUsers.id,runs.userId))
        .where(and(eq(runs.id,runId),eq(appUsers.authSubject,subject)));
      const changed = await db.update(providerCalls).set({ status,costMicroUsd: usage?.costMicroUsd ?? null,
        inputTokens: usage?.inputTokens ?? null,outputTokens: usage?.outputTokens ?? null,actualModel: usage?.actualModel ?? null,
        searchCredits: searchCredits ?? null,finishedAt: sql`clock_timestamp()` }).where(and(eq(providerCalls.id,id),eq(providerCalls.runId,runId),eq(providerCalls.status,"STARTED"),exists(owned))).returning({ id: providerCalls.id,stage:providerCalls.stage,requestedModel:providerCalls.requestedModel });
      if (changed.length !== 1) throw new AdmissionError("CONFLICT");
      recordProviderObservation({providerCallId:id,providerStage:changed[0].stage,outcome:status,costState:usage?.costMicroUsd!=null&&status!=="UNKNOWN"?"KNOWN":"UNKNOWN",knownCostMicroUsd:usage?.costMicroUsd?.toString(),inputTokens:usage?.inputTokens??null,outputTokens:usage?.outputTokens??null,searchCredits:searchCredits??null,actualModelMatch:usage?.actualModel?usage.actualModel===changed[0].requestedModel?"MATCH":"OTHER":"UNAVAILABLE"});
    },
  };
}
export function recordSafetyProvider(calls: ReturnType<typeof createProviderCalls>,stage: "INPUT_SAFETY" | "QUERY_SAFETY" | "QUERY_SECOND" | "EVIDENCE_SAFETY" | "OUTPUT_SAFETY",provider: SafetyProvider): SafetyProvider {
  if(isLocalSafetyGuard(provider))return provider;
  return { modelId: provider.modelId,usage: provider.usage,accepts: provider.accepts,
    async classify(input,signal) {
      const claim = await calls.begin(stage,provider.modelId,signal),id=claim.id,budget=providerDeadline(claim,signal);
      try {
        if(budget.signal.aborted){await calls.finish(id,'SKIPPED',noUsage);throw new Error('No dispatch');}
        const result = await provider.classify(input,budget.signal);
        await calls.finish(id,"SUCCEEDED",provider.usage?.());
        if(budget.signal.aborted)throw new Error('Deadline reached');return result;
      } catch (error) {
        try { await calls.finish(id,"UNKNOWN",provider.usage?.()); } catch { /* STARTED remains an unknown outcome. */ }
        throw new SafetyProviderError(budget.expired || error instanceof SafetyProviderError && error.reason==='TIMEOUT' ? "TIMEOUT" : "PROVIDER_UNAVAILABLE");
      }finally{budget.stop();}
    },
  };
}
export function recordSearchProvider(calls: ReturnType<typeof createProviderCalls>,provider: SearchProvider,stage:"SEARCH"|"SEARCH_SECOND"="SEARCH"): SearchProvider {
  return { async search(query,options) {
    return traceStage("search",async()=>{
    const claim = await calls.begin(stage,"tavily/basic",options.signal),id=claim.id,budget=providerDeadline(claim,options.signal);
    try {
      if(budget.signal.aborted){await calls.finish(id,'SKIPPED',noUsage);throw new AdmissionError('DEADLINE_EXCEEDED');}
      const response = await provider.search(query,{...options,signal:budget.signal,deadlineAt:claim.deadlineAt});await calls.finish(id,"SUCCEEDED",tavilyUsage(response.credits),response.credits);
      if(budget.signal.aborted)throw new AdmissionError('DEADLINE_EXCEEDED');return response;
    }
    catch { try { await calls.finish(id,"UNKNOWN"); } catch { /* Preserve unknown reservation. */ } throw new AdmissionError(budget.expired?"DEADLINE_EXCEEDED":options.signal.aborted?"CONFLICT":"PROVIDER_UNAVAILABLE"); }
    finally{budget.stop();}
    });
  } };
}

export function recordPlannerProvider(calls:ReturnType<typeof createProviderCalls>,provider:import('@/server/ai/planner-provider').PlannerProvider):import('@/server/ai/planner-provider').PlannerProvider{
 return {modelId:provider.modelId,usage:provider.usage,async plan(input,options){
  const claim=await calls.begin('PLANNER',provider.modelId,options.signal),budget=providerDeadline(claim,options.signal);
  try{
   if(budget.signal.aborted){await calls.finish(claim.id,'SKIPPED',noUsage);throw new Error('No dispatch');}
   const result=await provider.plan(input,{signal:budget.signal,deadlineAt:claim.deadlineAt});await calls.finish(claim.id,result.engine==='CONTEXT_RULE'?'SKIPPED':'SUCCEEDED',result.usage);
   if(budget.signal.aborted)throw new Error('Deadline');return result;
  }catch(error){
   // The planner reads a complete response before reporting usage, so a reported cost is final even if the plan is then rejected.
   const usage=provider.usage?.();
   try{await calls.finish(claim.id,usage?.costMicroUsd!=null?'SUCCEEDED':'UNKNOWN',usage);}catch{}
   if(budget.expired&&claim.runLimited)throw new AdmissionError('DEADLINE_EXCEEDED');
   if(options.signal.aborted)throw new AdmissionError('CONFLICT');
   // Only the planner's own limit ran out. The run still has time, so planRun may continue without a plan from the model.
   if(budget.expired)throw new PlanningError('TIMEOUT');
   throw error;
  }finally{budget.stop();}
 }};
}
export function recordExtractProvider(calls:ReturnType<typeof createProviderCalls>,provider:import('@/server/search/extract').ExtractProvider):import('@/server/search/extract').ExtractProvider{
 return {async extract(urls,options){return traceStage('extract',async()=>{
  const claim=await calls.begin('EXTRACT','tavily/extract-basic',options.signal),budget=providerDeadline(claim,options.signal);
  try{
   if(budget.signal.aborted){await calls.finish(claim.id,'SKIPPED',noUsage);throw new AdmissionError('DEADLINE_EXCEEDED');}
   const result=await provider.extract(urls,{signal:budget.signal,deadlineAt:claim.deadlineAt});await calls.finish(claim.id,'SUCCEEDED',tavilyUsage(result.credits),result.credits);
   if(budget.signal.aborted)throw new AdmissionError('DEADLINE_EXCEEDED');return result;
  }catch{try{await calls.finish(claim.id,'UNKNOWN');}catch{}throw new AdmissionError(budget.expired?'DEADLINE_EXCEEDED':options.signal.aborted?'CONFLICT':'PROVIDER_UNAVAILABLE');}finally{budget.stop();}
 });}};
}
// Files mode: the question's embedding is a paid call, so it gets a claim, a deadline and a recorded cost.
export function recordEmbeddingProvider(calls:ReturnType<typeof createProviderCalls>,provider:import('@/server/documents/embedding').EmbeddingProvider):import('@/server/documents/embedding').EmbeddingProvider{
 return {modelId:provider.modelId,async embed(texts,signal){
  const claim=await calls.begin('QUERY_EMBEDDING',provider.modelId,signal),budget=providerDeadline(claim,signal);
  try{
   if(budget.signal.aborted){await calls.finish(claim.id,'SKIPPED',noUsage);throw new AdmissionError('DEADLINE_EXCEEDED');}
   const result=await provider.embed(texts,budget.signal);
   await calls.finish(claim.id,'SUCCEEDED',{costMicroUsd:result.costMicroUsd,inputTokens:null,outputTokens:null,actualModel:result.model});
   if(budget.signal.aborted)throw new AdmissionError('DEADLINE_EXCEEDED');
   return result;
  }catch(error){
   try{await calls.finish(claim.id,'UNKNOWN');}catch{/* Already recorded; an unknown outcome stays held. */}
   if(error instanceof AdmissionError)throw error;
   throw new AdmissionError(budget.expired?'DEADLINE_EXCEEDED':signal.aborted?'CONFLICT':'PROVIDER_UNAVAILABLE');
  }finally{budget.stop();}
 }};
}
