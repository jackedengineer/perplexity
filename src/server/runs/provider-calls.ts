import { and,eq,exists,sql } from "drizzle-orm";
import { providerCalls,runs,appUsers } from "@/db/schema";
import type { AdmissionDatabase } from "./usage";
import { lockOwnedRun } from "./lock";
import { AdmissionError } from "./errors";
import type { ProviderUsage } from "@/server/ai/usage";
import { SafetyProviderError,type SafetyProvider } from "@/server/safety/provider";
import type { SearchProvider } from "@/server/search/tavily";
import {providerDeadline,stageLimits,type ProviderStage} from './budgets';
import {recordProviderObservation,traceStage} from '@/server/telemetry/trace';
const noUsage:ProviderUsage={costMicroUsd:0n,inputTokens:0,outputTokens:0,actualModel:null};
const phases = { PLANNER: "PLANNING",QUERY_SECOND:"SEARCHING",SEARCH_SECOND:"SEARCHING",EXTRACT:"PREPARING_EVIDENCE", INPUT_SAFETY: "CHECKING_INPUT",QUERY_SAFETY: "SEARCHING",SEARCH: "SEARCHING",EVIDENCE_SAFETY: "PREPARING_EVIDENCE",ANSWER: "GENERATING",OUTPUT_SAFETY: "CHECKING_OUTPUT" };
export function createProviderCalls(db: AdmissionDatabase,subject: string,runId: string) {
  return {
    async begin(stage: ProviderStage,requestedModel: string,signal?:AbortSignal) {
      const observedAt=performance.now();
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
        return {id:call.id,deadlineAt:run.deadlineAt,remainingMs:Math.min(limits.maxDurationMs,run.deadlineAt.getTime()-now.getTime()),observedAt};
      });
      recordProviderObservation({providerCallId:claim.id,providerStage:stage,modelId:/^[a-z0-9-]+\/[A-Za-z0-9._:-]+$/u.test(requestedModel)?requestedModel:undefined,outcome:"UNKNOWN",costState:"UNKNOWN",inputTokens:null,outputTokens:null,searchCredits:null},true);
      return claim;
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
  return { modelId: provider.modelId,usage: provider.usage,
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
      const response = await provider.search(query,{...options,signal:budget.signal,deadlineAt:claim.deadlineAt});await calls.finish(id,"SUCCEEDED",undefined,response.credits);
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
   const result=await provider.plan(input,{signal:budget.signal,deadlineAt:claim.deadlineAt});await calls.finish(claim.id,'SUCCEEDED',result.usage);
   if(budget.signal.aborted)throw new Error('Deadline');return result;
  }catch(error){try{await calls.finish(claim.id,'UNKNOWN',provider.usage?.());}catch{}throw error;}finally{budget.stop();}
 }};
}
export function recordExtractProvider(calls:ReturnType<typeof createProviderCalls>,provider:import('@/server/search/extract').ExtractProvider):import('@/server/search/extract').ExtractProvider{
 return {async extract(urls,options){return traceStage('extract',async()=>{
  const claim=await calls.begin('EXTRACT','tavily/extract-basic',options.signal),budget=providerDeadline(claim,options.signal);
  try{
   if(budget.signal.aborted){await calls.finish(claim.id,'SKIPPED',noUsage);throw new AdmissionError('DEADLINE_EXCEEDED');}
   const result=await provider.extract(urls,{signal:budget.signal,deadlineAt:claim.deadlineAt});await calls.finish(claim.id,'SUCCEEDED',undefined,result.credits);
   if(budget.signal.aborted)throw new AdmissionError('DEADLINE_EXCEEDED');return result;
  }catch{try{await calls.finish(claim.id,'UNKNOWN');}catch{}throw new AdmissionError(budget.expired?'DEADLINE_EXCEEDED':options.signal.aborted?'CONFLICT':'PROVIDER_UNAVAILABLE');}finally{budget.stop();}
 });}};
}
