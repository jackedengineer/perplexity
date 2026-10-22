import { and,eq,sql } from "drizzle-orm";
import { providerCalls } from "@/db/schema";
import type { AdmissionDatabase } from "./usage";
import { lockOwnedRun } from "./lock";
import { AdmissionError } from "./errors";
import type { ProviderUsage } from "@/server/ai/usage";
import { SafetyProviderError,type SafetyProvider } from "@/server/safety/provider";
import type { SearchProvider } from "@/server/search/tavily";
export const STAGE_CAPS = Object.freeze({ INPUT_SAFETY: 5000n,QUERY_SAFETY: 5000n,SEARCH: 8000n,EVIDENCE_SAFETY: 5000n,ANSWER: 20000n,OUTPUT_SAFETY: 5000n });
export type ProviderStage = keyof typeof STAGE_CAPS;
const phases = { INPUT_SAFETY: "CHECKING_INPUT",QUERY_SAFETY: "SEARCHING",SEARCH: "SEARCHING",EVIDENCE_SAFETY: "PREPARING_EVIDENCE",ANSWER: "GENERATING",OUTPUT_SAFETY: "CHECKING_OUTPUT" };
export function createProviderCalls(db: AdmissionDatabase,subject: string,runId: string) {
  return {
    async begin(stage: ProviderStage,requestedModel: string) {
      return db.transaction(async(tx)=>{
        const { run,now } = await lockOwnedRun(tx,subject,runId);
        if (run.accountingVersion !== 1) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
        if (run.status !== phases[stage] || run.deadlineAt <= now) throw new AdmissionError("CONFLICT");
        const [{ total,overages }] = await tx.select({ overages: sql<number>`count(*) filter (where ${providerCalls.costMicroUsd} > ${providerCalls.capMicroUsd})::integer`,total: sql<string>`coalesce(sum(${providerCalls.capMicroUsd}),0)::text` }).from(providerCalls).where(eq(providerCalls.runId,runId));
        if (overages > 0 || BigInt(total)+STAGE_CAPS[stage] > run.providerReserveMicroUsd) throw new AdmissionError("BUDGET_EXCEEDED");
        const [call] = await tx.insert(providerCalls).values({ runId,stage,requestedModel,attemptVersion: run.attemptVersion,
          capMicroUsd: STAGE_CAPS[stage],status: "STARTED",startedAt: now }).returning({ id: providerCalls.id });
        return call.id;
      });
    },
    async finish(id: string,status: "SUCCEEDED" | "UNKNOWN" | "SKIPPED",usage?: ProviderUsage,searchCredits?: 1) {
      // A paid result may arrive after cancellation/fencing; record its cost without authorizing continuation.
      return db.transaction(async(tx)=>{
      await lockOwnedRun(tx,subject,runId);
      const changed = await tx.update(providerCalls).set({ status,costMicroUsd: usage?.costMicroUsd ?? null,
        inputTokens: usage?.inputTokens ?? null,outputTokens: usage?.outputTokens ?? null,actualModel: usage?.actualModel ?? null,
        searchCredits: searchCredits ?? null,finishedAt: sql`clock_timestamp()` }).where(and(eq(providerCalls.id,id),eq(providerCalls.runId,runId),eq(providerCalls.status,"STARTED"))).returning({ id: providerCalls.id });
      if (changed.length !== 1) throw new AdmissionError("CONFLICT");
      });
    },
  };
}
export function recordSafetyProvider(calls: ReturnType<typeof createProviderCalls>,stage: "INPUT_SAFETY" | "QUERY_SAFETY" | "EVIDENCE_SAFETY" | "OUTPUT_SAFETY",provider: SafetyProvider): SafetyProvider {
  return { modelId: provider.modelId,usage: provider.usage,
    async classify(input,signal) {
      const id = await calls.begin(stage,provider.modelId);
      try {
        const result = await provider.classify(input,signal);
        await calls.finish(id,"SUCCEEDED",provider.usage?.());return result;
      } catch {
        try { await calls.finish(id,"UNKNOWN",provider.usage?.()); } catch { /* STARTED remains an unknown outcome. */ }
        throw new SafetyProviderError("PROVIDER_UNAVAILABLE");
      }
    },
  };
}
export function recordSearchProvider(calls: ReturnType<typeof createProviderCalls>,provider: SearchProvider): SearchProvider {
  return { async search(query,options) {
    const id = await calls.begin("SEARCH","tavily/basic");
    try { const response = await provider.search(query,options);await calls.finish(id,"SUCCEEDED",undefined,response.credits);return response; }
    catch { try { await calls.finish(id,"UNKNOWN"); } catch { /* Preserve unknown reservation. */ } throw new AdmissionError("PROVIDER_UNAVAILABLE"); }
  } };
}
