import {createHash} from 'node:crypto';
import {recordTelemetry} from '@/server/telemetry/trace';
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { inputSafetyReviews, messages, runDocuments, runRetrievals, runs, runSources, sourcePassages, usageReservations,runPlans } from "@/db/schema";
import type { PublicErrorCode } from "@/server/contracts/errors";
import { AdmissionError } from "@/server/runs/errors";
import { lockOwnedRun } from "@/server/runs/lock";
import type { AdmissionDatabase, AdmissionTransaction } from "@/server/runs/usage";
import { createInputGate } from "@/server/safety/input";
import { createEvidenceGate, EVIDENCE_DETECTOR_VERSION } from "@/server/safety/evidence";
import { SAFETY_POLICY } from "@/server/safety/policy";
import { buildEvidence, validateEvidence } from "./evidence";
import { RETRIEVAL_LIMITS, RetrievalError, searchQuerySchema } from "./limits";
import type {ExtractProvider} from "./extract";
import {rankEvidenceResults,explicitPreferredDomains,type RankedResult} from "./rank";
import {freshnessTimeRange} from './freshness';
import type { SearchProvider } from "./tavily";
import {queryPlanSchema} from "@/server/contracts/pipeline";
import {hasSearchTopic} from '@/server/ai/plan';
import {STAGE_LIMITS} from '@/server/runs/budgets';
import type {DocumentFinder} from '@/server/documents/retrieve';
import type { EvidencePackage } from "@/server/contracts/pipeline";

type Dependencies = {documents?:DocumentFinder;extract?:ExtractProvider;searchSecond?:SearchProvider;querySecondGate?:ReturnType<typeof createInputGate>;modelId: string; search: SearchProvider; queryGate: ReturnType<typeof createInputGate>; evidenceGate: ReturnType<typeof createEvidenceGate> };
export type RetrievalResult = { kind: "READY" | "NO_EVIDENCE";runId: string;sources: number;passages: number }
  | { kind: "RUN_IN_PROGRESS" | "RUN_ALREADY_FINISHED";runId: string } | { kind: "DENIED";code: PublicErrorCode };
const denied = (code: PublicErrorCode): RetrievalResult => ({ kind: "DENIED",code });
const terminal = new Set(["COMPLETED","NEEDS_CLARIFICATION","BLOCKED","FAILED","CANCELLED","TIMED_OUT"]);
// Web with attached files: alternate file pages and web results, at most three file pages,
// so neither source crowds the other out of the five evidence slots.
export function mixResults(files:RankedResult[],web:RankedResult[],maxFiles=3):RankedResult[]{
  if(!files.length)return web;if(!web.length)return files;
  const mixed:RankedResult[]=[];
  for(let index=0;index<Math.max(files.length,web.length);index++){if(index<maxFiles&&files[index])mixed.push(files[index]);if(web[index])mixed.push(web[index]);}
  return mixed;
}
const extractionMinimumRemainingMs=STAGE_LIMITS.EXTRACT.maxDurationMs+STAGE_LIMITS.EVIDENCE_SAFETY.maxDurationMs+
 STAGE_LIMITS.ANSWER.maxDurationMs+STAGE_LIMITS.OUTPUT_SAFETY.maxDurationMs+5000; // persistence reserve
type Fence = { attemptVersion: number; admittedRevision: number };
async function checkpoint(tx: AdmissionTransaction,subject: string,runId: string,fence: Fence,status: string,signal: AbortSignal) {
  const locked = await lockOwnedRun(tx,subject,runId), { run,conversation,now } = locked;
  if (run.status !== status || run.attemptVersion !== fence.attemptVersion || conversation.revision !== fence.admittedRevision ||
    run.admittedRevision !== fence.admittedRevision || run.policyVersion !== SAFETY_POLICY.version) throw new AdmissionError("CONFLICT");
  if (signal.aborted || run.deadlineAt <= now) throw new RetrievalError();
  return locked;
}
export function createRetrieval(db: AdmissionDatabase,dependencies?: Dependencies) {
  return {
    async retrieve(subject: string,runId: string,signal: AbortSignal): Promise<RetrievalResult> {
      if (!z.uuid().safeParse(runId).success) return denied("NOT_FOUND");
      if (!dependencies) return denied("CONFIGURATION_UNAVAILABLE");
      const { search,queryGate,evidenceGate } = dependencies;
      let claim: Fence | undefined,stage = "SEARCHING";
      let queryVerdict: string | null = null,evidenceVerdict: string | null = null,searchCredits: number | null = null;
      try {
        const prepared = await db.transaction(async(tx)=>{
          const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
          if (run.status !== "PLANNING") return { kind: terminal.has(run.status) ? "RUN_ALREADY_FINISHED" : "RUN_IN_PROGRESS",runId } as const;
          if (signal.aborted || run.deadlineAt <= now) throw new RetrievalError();
          if (conversation.revision !== run.admittedRevision) throw new AdmissionError("CONFLICT");
          if (run.policyVersion !== SAFETY_POLICY.version || !(["fast-v1:standard-v1","trials-v1:credits-v1","trials-v2:credits-v2"].includes(`${run.catalogVersion}:${run.priceVersion}`))) throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
          const [reservation] = await tx.select().from(usageReservations).where(and(eq(usageReservations.runId,runId),eq(usageReservations.userId,run.userId)));
          if (!reservation || reservation.providerReserveMicroUsd < RETRIEVAL_LIMITS.reserveMicroUsd) throw new AdmissionError("BUDGET_EXCEEDED");
          const [review] = await tx.select().from(inputSafetyReviews).where(and(eq(inputSafetyReviews.runId,runId),eq(inputSafetyReviews.decision,"ALLOW"),eq(inputSafetyReviews.attemptVersion,run.attemptVersion)));
          if (!review?.acceptedMessageId || review.policyVersion !== SAFETY_POLICY.version) throw new AdmissionError("SAFETY_UNAVAILABLE");
          const [message] = await tx.select().from(messages).where(and(eq(messages.id,review.acceptedMessageId),eq(messages.conversationId,run.conversationId)));
          const parts = z.tuple([z.strictObject({ type: z.literal("text"),text: z.string().min(1).max(4000) })]).safeParse(message?.parts);
          if (!message?.approvedAt || message.role !== "USER" || message.kind !== "QUESTION" ||
            message.policyVersion !== SAFETY_POLICY.version || !parts.success) throw new AdmissionError("INVALID_INPUT");
          const [record]=await tx.select().from(runPlans).where(eq(runPlans.runId,runId));
          const plan=record?queryPlanSchema.parse(record.plan):null;
          // Only historical v1 snapshots may use the original-query retrieval path.
          if(run.accountingVersion>=2&&!record)throw new AdmissionError('CONFLICT');
          if(record&&(record.originalHash!==createHash('sha256').update(parts.data[0].text).digest('hex')||record.messageId!==message.id||record.attemptVersion!==run.attemptVersion||plan?.action!=='ANSWER'))throw new AdmissionError('CONFLICT');
          const query=searchQuerySchema.parse(plan?.action==='ANSWER'?plan.retrieval.queries[0]:parts.data[0].text);
          const rows=await tx.select({id:runDocuments.documentId}).from(runDocuments).where(and(eq(runDocuments.runId,runId),eq(runDocuments.userId,run.userId))).orderBy(runDocuments.position);
          const attached=rows.flatMap(row=>row.id?[row.id]:[]);
          // A file deleted since admission leaves its row with no document. Searching the rest, or
          // every file the user owns, would answer from something they didn't attach.
          if(attached.length<rows.length)throw new RetrievalError('DOCUMENT_NOT_READY');
          // Files runs search the owner's own documents: no web query leaves the server and no search credits are spent.
          // Web runs with files search both and stay WEB, because search credits are spent, unless the
          // question has no topic of its own ("Summarize this"), when only the files are searched.
          const planned=plan?.action==='ANSWER'?plan.retrieval.queries:[query];
          const sourceKind=run.mode==='DOCUMENTS'||attached.length&&!planned.some(hasSearchTopic)?'DOCUMENTS' as const:'WEB' as const;
          if((sourceKind==='DOCUMENTS'||attached.length)&&!dependencies.documents)throw new AdmissionError('CONFIGURATION_UNAVAILABLE');
          await tx.insert(runRetrievals).values({ runId,attemptVersion: run.attemptVersion,policyVersion: run.policyVersion,sourceKind,
            detectorVersion: EVIDENCE_DETECTOR_VERSION,modelId: sourceKind==='DOCUMENTS'?dependencies.documents!.modelId:dependencies.modelId,status: "STARTED",createdAt: now,expiresAt: new Date(now.getTime()+30*86_400_000) });
          await tx.update(runs).set({ status: "SEARCHING",updatedAt: now }).where(eq(runs.id,runId));
          return { kind: "CLAIMED",run,query,plan,original:parts.data[0].text,sourceKind,attached } as const;
        });
        if (prepared.kind !== "CLAIMED") return prepared;
        claim = prepared.run;
        const options = { signal,deadlineAt: prepared.run.deadlineAt };
        const plannedQueries=prepared.plan?.action==='ANSWER'?prepared.plan.retrieval.queries:[prepared.query];
        const queries=prepared.run.modelKey.startsWith('economy-')||prepared.sourceKind==='DOCUMENTS'?plannedQueries.slice(0,1):plannedQueries;
        if(queries.length>2||queries.length===2&&(!dependencies.querySecondGate||!dependencies.searchSecond))throw new AdmissionError('CONFIGURATION_UNAVAILABLE');
        for(const [index,query] of queries.entries()){
          const gate=index===0?queryGate:dependencies.querySecondGate!;
          const check=await gate.evaluate({text:query,context:[{role:'USER',text:prepared.original}]},options);
          queryVerdict=check.verdict.decision;
          if(queryVerdict!=='ALLOW')throw new RetrievalError(queryVerdict==='BLOCK'?'INPUT_BLOCKED':check.reason==='TIMEOUT'?'DEADLINE_EXCEEDED':'SAFETY_UNAVAILABLE');
        }
        await db.transaction(tx=>checkpoint(tx,subject,runId,prepared.run,stage,signal));
        const plan=prepared.plan?.action==='ANSWER'?prepared.plan:null;
        const filters=plan?{freshness:plan.retrieval.freshness,...(plan.retrieval.freshness==='RECENT'?{timeRange:freshnessTimeRange(plan.standaloneQuestion)??freshnessTimeRange(prepared.original)??'month'}:{}),startDate:plan.retrieval.startDate,endDate:plan.retrieval.endDate,preferredDomains:explicitPreferredDomains(prepared.original)}:undefined;
        const web=prepared.sourceKind==='WEB';
        const finder=prepared.sourceKind==='DOCUMENTS'||prepared.attached.length?dependencies.documents!:null;
        const [fileOutcome,...responses]=await Promise.allSettled([
          finder?finder.find({ownerId:prepared.run.userId,question:plan?.standaloneQuestion??prepared.original,queries,...(prepared.attached.length?{documentIds:prepared.attached}:{})},options):Promise.resolve([] as RankedResult[]),
          ...(web?queries.map((query,index)=>(index===0?search:dependencies.searchSecond!).search(query,{...options,...(filters?{filters}:{})})):[]),
        ]);
        const timedOut=(r:PromiseSettledResult<unknown>)=>r.status==='rejected'&&(r.reason instanceof AdmissionError||r.reason instanceof RetrievalError)&&r.reason.code==='DEADLINE_EXCEEDED';
        const successful=(responses as PromiseSettledResult<{results:RankedResult[];credits:number}>[]).flatMap(r=>r.status==='fulfilled'?[r.value]:[]);
        // Recorded before any failure below, so a failed run still shows the credits it spent.
        if(web&&successful.length)searchCredits=successful.reduce((sum,r)=>sum+r.credits,0);
        // Attached files are required: an answer from the web alone would silently ignore them.
        if(fileOutcome.status==='rejected'){
          if(signal.aborted)throw new AdmissionError('CONFLICT');
          throw new RetrievalError(timedOut(fileOutcome)?'DEADLINE_EXCEEDED':'PROVIDER_UNAVAILABLE');
        }
        if(web&&!successful.length){
          if(signal.aborted)throw new AdmissionError('CONFLICT');
          throw new RetrievalError(responses.every(timedOut)?'DEADLINE_EXCEEDED':'PROVIDER_UNAVAILABLE');
        }
        const fileResults=fileOutcome.value;
        const response={results:[...fileResults,...successful.flatMap(r=>r.results)],credits:successful.reduce((sum,r)=>sum+r.credits,0)};searchCredits=web?response.credits:null;
        await db.transaction(async(tx)=>{
          const { now } = await checkpoint(tx,subject,runId,prepared.run,stage,signal);
          await tx.update(runs).set({ status: 'PREPARING_EVIDENCE',updatedAt: now }).where(eq(runs.id,runId));
        });
        stage = 'PREPARING_EVIDENCE';
        let extractionFailures=0;
        // Document matches arrive already fused and ranked; web results are ranked here.
        const webResults=successful.flatMap(r=>r.results);
        let selected:RankedResult[]=plan&&web?rankEvidenceResults(webResults,plan.standaloneQuestion,new Date(),filters):webResults;
        // Preserve enough of the absolute deadline for answer, output safety and persistence.
        if(web&&!prepared.run.modelKey.startsWith('economy-')&&dependencies.extract&&selected.length&&prepared.run.deadlineAt.getTime()-Date.now()>extractionMinimumRemainingMs){
          await db.transaction(tx=>checkpoint(tx,subject,runId,prepared.run,stage,signal));
          try{
            const extracted=await dependencies.extract.extract(selected.slice(0,2).map(r=>r.url),options);
            extractionFailures=extracted.failedUrls.length+extracted.rejectedUrls.length;
            selected=selected.filter(row=>!extracted.rejectedUrls.includes(row.url)).map(row=>{
              const page=extracted.pages.find(p=>p.url===row.url);
              return page?{...row,content:page.content,contentKind:'EXTRACTED_PAGE' as const,retrievedAt:page.retrievedAt}:row;
            });
            selected=rankEvidenceResults(selected,plan?.standaloneQuestion??prepared.original,new Date(),filters);
          }catch(error){
            extractionFailures=Math.min(selected.length,2);
            if(signal.aborted||Date.now()>=prepared.run.deadlineAt.getTime())throw error;
            // Optional extraction outage retains the inspected search passages, never invented page text.
          }
        }
        const evidence = buildEvidence(runId,mixResults(fileResults,selected),new Date());
        recordTelemetry("research.sources",{returnedSources:response.results.length,sourceCount:evidence.sources.length,discardedSources:Math.max(0,response.results.length-evidence.sources.length),extractedSources:evidence.passages.filter(p=>p.contentKind==='EXTRACTED_PAGE').length,extractionFailures});
        if (evidence.sources.length) {
          const checked = await evidenceGate.evaluate(evidence,options); evidenceVerdict = checked.verdict.decision;
          if (evidenceVerdict !== "ALLOW") throw new RetrievalError(evidenceVerdict === "BLOCK" ? "OUTPUT_BLOCKED" : "reason" in checked && checked.reason === "TIMEOUT" ? "DEADLINE_EXCEEDED" : "SAFETY_UNAVAILABLE");
        }
        return await db.transaction(async(tx): Promise<RetrievalResult>=>{
          const { now } = await checkpoint(tx,subject,runId,prepared.run,stage,signal);
          const status = evidence.sources.length ? "READY" : "NO_EVIDENCE";
          const reviewed = await tx.update(runRetrievals).set({ status,queryVerdict,evidenceVerdict,searchCredits })
            .where(and(eq(runRetrievals.runId,runId),eq(runRetrievals.status,"STARTED"))).returning({ id: runRetrievals.runId });
          if (!reviewed.length) throw new AdmissionError("CONFLICT");
          if (evidence.sources.length) {
            const stored = await tx.insert(runSources).values(evidence.sources.map(source=>({ runId,sourceKey: source.sourceId,url: source.url,
              title: source.title,rank: source.sourceRank,retrievedAt: new Date(source.retrievedAt),
              publishedAt: source.publishedAt ? new Date(source.publishedAt) : null }))).returning({ id: runSources.id,key: runSources.sourceKey });
            await tx.insert(sourcePassages).values(evidence.passages.map(passage=>({ id: passage.passageId,runId,
              sourceId: stored.find(source=>source.key === passage.sourceId)!.id,text: passage.text,contentHash: passage.contentHash,contentKind: passage.contentKind })));
          }
          if (signal.aborted) throw new RetrievalError();
          const changed = await tx.update(runs).set({ status: "GENERATING",updatedAt: now }).where(and(eq(runs.id,runId),eq(runs.status,"PREPARING_EVIDENCE"),
            eq(runs.attemptVersion,prepared.run.attemptVersion),gt(runs.deadlineAt,sql`clock_timestamp()`))).returning({ id: runs.id });
          if (!changed.length || signal.aborted) throw new RetrievalError();
          return { kind: status,runId,sources: evidence.sources.length,passages: evidence.passages.length };
        });
      } catch (error) {
        const fence = claim;
        const code = error instanceof AdmissionError || error instanceof RetrievalError ? error.code : "PROVIDER_UNAVAILABLE";
        if (fence) {
          try { await db.transaction(async(tx)=>{
            const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
            if (run.attemptVersion !== fence.attemptVersion || run.status !== stage || conversation.revision !== fence.admittedRevision) return;
            const status = run.deadlineAt <= now || code === "DEADLINE_EXCEEDED" ? "TIMED_OUT" : signal.aborted ? "CANCELLED" : code === "INPUT_BLOCKED" || code === "OUTPUT_BLOCKED" ? "BLOCKED" : "FAILED";
            await tx.update(runRetrievals).set({ status: status === "BLOCKED" ? "BLOCKED" : "UNAVAILABLE",queryVerdict,evidenceVerdict,searchCredits }).where(eq(runRetrievals.runId,runId));
            await tx.update(runs).set({ status,updatedAt: now }).where(eq(runs.id,runId));
          }); } catch { /* Keep an unknown outcome held; never retry provider work. */ }
        }
        return denied(code);
      }
    },
    async load(subject: string,runId: string): Promise<EvidencePackage | null> {
      if (!z.uuid().safeParse(runId).success) return null;
      try { return await db.transaction(async(tx)=>{
        const { run,conversation,now } = await lockOwnedRun(tx,subject,runId);
        const [record] = await tx.select().from(runRetrievals).where(eq(runRetrievals.runId,runId));
        if (!record || !["READY","NO_EVIDENCE"].includes(record.status) || record.expiresAt <= now || run.deadlineAt <= now || run.status !== "GENERATING" ||
          record.attemptVersion !== run.attemptVersion || record.policyVersion !== SAFETY_POLICY.version || run.policyVersion !== record.policyVersion || conversation.revision !== run.admittedRevision) return null;
        const sources = await tx.select().from(runSources).where(eq(runSources.runId,runId)).orderBy(runSources.rank).limit(6);
        const passages = await tx.select().from(sourcePassages).where(eq(sourcePassages.runId,runId)).limit(6);
        if ((record.status === "READY") !== (sources.length > 0)) return null;
        return validateEvidence({ runId,sources: sources.map(s=>({ sourceId: s.sourceKey,url: s.url,title: s.title,sourceRank: s.rank,
          publishedAt: s.publishedAt?.toISOString() ?? null,retrievedAt: s.retrievedAt.toISOString() })),
          passages: passages.map(p=>({ passageId: p.id,sourceId: sources.find(s=>s.id === p.sourceId)?.sourceKey,text: p.text,contentHash: p.contentHash,contentKind: p.contentKind })) });
      }); } catch { return null; }
    },
  };
}
