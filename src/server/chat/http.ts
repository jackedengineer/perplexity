import {withTelemetry,traceStage,bindRunTelemetry,recordTelemetry} from '@/server/telemetry/trace';
import {AsyncLocalStorage} from 'node:async_hooks';
import { createUIMessageStream,createUIMessageStreamResponse } from "ai";
import type { SubmitQuery } from "@/server/contracts/chat";
import { createPublicError,type PublicErrorCode } from "@/server/contracts/errors";
import { isTrustedSubmissionOrigin,readSubmission } from "@/server/runs/input";
import { AdmissionError } from "@/server/runs/errors";
import type { AdmissionResult } from "@/server/runs/admit";
import type { PublicStage } from "@/server/contracts/progress";
import type { ChatIdentity } from "./delivery";
import type { ResearchMessage,RunState } from "./views";
type Run = Exclude<AdmissionResult,{ kind: "DENIED" }>["run"];
type OutcomeCategory='success'|'rate'|'quota'|'deadline'|'policy'|'infrastructure'|'access'|'state'|'validation';
const categories:Record<PublicErrorCode|'COMPLETED',OutcomeCategory>={
  COMPLETED:'success',RATE_LIMITED:'rate',BUDGET_EXCEEDED:'quota',DEADLINE_EXCEEDED:'deadline',REQUEST_TIMEOUT:'deadline',
  INPUT_BLOCKED:'policy',OUTPUT_BLOCKED:'policy',SAFETY_UNAVAILABLE:'infrastructure',PROVIDER_UNAVAILABLE:'infrastructure',CONFIGURATION_UNAVAILABLE:'infrastructure',
  UNAUTHENTICATED:'access',INVALID_ORIGIN:'access',NOT_FOUND:'access',CONFLICT:'state',RUN_IN_PROGRESS:'state',RUN_ALREADY_FINISHED:'state',
  MALFORMED_JSON:'validation',TOO_LARGE:'validation',UNSUPPORTED_MEDIA_TYPE:'validation',INVALID_INPUT:'validation',IDEMPOTENCY_MISMATCH:'validation',
};
export type ChatBackend = {
  admit(subject: string,input: SubmitQuery): Promise<AdmissionResult>;
  execute(identity: ChatIdentity,run: Run,input: SubmitQuery,signal: AbortSignal,onStage: (stage: PublicStage)=>void): Promise<{kind: "COMPLETED"} | {kind: "DENIED";code: PublicErrorCode}>;
  load(identity: ChatIdentity,runId: string): Promise<RunState>;
};
type Dependencies = { identity: (request: Request)=>Promise<ChatIdentity | null>;origin: ()=>string;backend: ()=>ChatBackend;
  consumeRequest: (subject: string|null)=>Promise<void>;
  load: ChatBackend["load"];log: (event: { event: string;requestId: string;outcome: string;category:OutcomeCategory;durationMs: number;runId?:string })=>void };
const headers = (requestId: string)=>({ "Cache-Control": "private, no-store","X-Request-Id": requestId,"X-Content-Type-Options": "nosniff" });
function failure(code: PublicErrorCode,requestId: string,run?: Run) {
  const error = createPublicError(code,requestId);
  return Response.json(error.body,{ status: error.status,headers: { ...headers(requestId),...(run ? { "X-Run-Id": run.id,"X-Run-Revision": String(run.revision) } : {}) } });
}
export function createChatHttp(dependencies: Dependencies) {
  const log:Dependencies["log"]=event=>{try{void Promise.resolve(dependencies.log(event)).catch(()=>{});}catch{/* Diagnostics cannot affect delivery or admission. */}};
  return {
    async post(request: Request) {
      const requestId = crypto.randomUUID(),started = performance.now();
      return withTelemetry(requestId,async()=>{
      try {
        const identity = await traceStage("http.identity",()=>dependencies.identity(request),identity=>({outcome:identity?'SUCCEEDED':'UNAUTHENTICATED'}));
        const origin=dependencies.origin();
        await traceStage("http.request_limit",()=>dependencies.consumeRequest(isTrustedSubmissionOrigin(request,origin)?identity?.user.id??null:null));
        if (!identity) throw new AdmissionError("UNAUTHENTICATED");
        const input = await traceStage("http.validation",()=>readSubmission(request,origin)),backend = await traceStage("http.configuration",async()=>dependencies.backend());
        const admission = await traceStage("http.admission",async()=>{
          const result=await backend.admit(identity.user.id,input);if(result.kind!=="DENIED")bindRunTelemetry({runId:result.run.id});return result;
        });
        if (admission.kind === "DENIED") {
          log({event:'chat.admission',requestId,outcome:admission.code,category:categories[admission.code],durationMs:Math.round(performance.now()-started)});
          return failure(admission.code,requestId);
        }
        const run = admission.run;
        log({event:"chat.admission",requestId,runId:run.id,outcome:admission.kind,category:admission.kind==="ADMITTED"?"success":"state",durationMs:Math.round(performance.now()-started)});
        if (admission.kind === "RUN_IN_PROGRESS") {
          return failure("RUN_IN_PROGRESS",requestId,run);
        }
        const controller = new AbortController(),signal = AbortSignal.any([request.signal,controller.signal]);
        let reportApprovedDelivery:(()=>void)|undefined;
        const stream = createUIMessageStream<ResearchMessage>({
          onError: ()=>createPublicError("PROVIDER_UNAVAILABLE",requestId).body.error.message,
          async execute({ writer }) {
            // Flush owned admission metadata so hosted clients can cancel before
            // input approval. No question, source, draft or safety verdict is sent.
            writer.write({type:'data-run',data:{runId:run.id,revision:run.revision},transient:true});
            let outcome:PublicErrorCode|'COMPLETED' = "COMPLETED",firstProgress=true;
            return traceStage("http.delivery",async()=>{
            try {
              if (admission.kind === "ADMITTED") {
                const result = await backend.execute(identity,run,input,signal,stage=>{
                  if(firstProgress){firstProgress=false;recordTelemetry("research.first_progress",{outcome:"SUCCEEDED",durationMs:Math.round(performance.now()-started)});}
                  writer.write({ type: "data-stage",data: { runId: run.id,stage },transient: true });
                });
                if (result.kind === "DENIED") throw new AdmissionError(result.code);
              }
              const saved = await backend.load(identity,run.id);
              if (signal.aborted || !["COMPLETED","NEEDS_CLARIFICATION"].includes(saved.state) || !saved.answer) throw new AdmissionError("RUN_ALREADY_FINISHED");
              const answer = saved.answer;
              // The SDK writer suppresses closed-stream errors. Record only after
              // the approved chunk is enqueued into the public response below.
              reportApprovedDelivery=AsyncLocalStorage.bind(()=>recordTelemetry("research.approved_delivery",{outcome:"COMPLETED",durationMs:Math.round(performance.now()-started)}));
              writer.write({ type: "start",messageId: answer.messageId });
              writer.write({ type: "data-answer",data: answer });
              for (const source of answer.answer.sources) writer.write({ type: "source-url",sourceId: source.sourceId,url: source.url,title: source.title });
              writer.write({ type: "text-start",id: answer.messageId });
              writer.write({ type: "text-delta",id: answer.messageId,delta: answer.text });
              writer.write({ type: "text-end",id: answer.messageId });
              writer.write({ type: "finish",finishReason: "stop" });
            } catch (error) {
              const code = error instanceof AdmissionError ? error.code : "PROVIDER_UNAVAILABLE";outcome = code;
              writer.write({ type: "error",errorText: createPublicError(code,requestId).body.error.message });
              writer.write({ type: "finish",finishReason: "error" });
            } finally { log({ event: "chat.execution",requestId,runId:run.id,outcome,category:categories[outcome],durationMs: Math.round(performance.now()-started) }); }
            },()=>({outcome}));
          },
        });
        const reader = stream.getReader();
        const cancellable = new ReadableStream({ async pull(target) { const next = await reader.read();if (next.done) target.close();else {
          target.enqueue(next.value);
          if(next.value.type==='data-answer'&&!signal.aborted){reportApprovedDelivery?.();reportApprovedDelivery=undefined;}
        } },
          async cancel(reason) { controller.abort();await reader.cancel(reason); } });
        return createUIMessageStreamResponse({ stream: cancellable,headers: { ...headers(requestId),"X-Run-Id": run.id,"X-Run-Revision": String(run.revision),"Server-Timing": `admission;dur=${Math.round(performance.now()-started)}` } });
      } catch (error) {
        const code = error instanceof AdmissionError ? error.code : "CONFIGURATION_UNAVAILABLE";
        log({ event: "chat.admission",requestId,outcome: code,category:categories[code],durationMs: Math.round(performance.now()-started) });
        return failure(code,requestId);
      }
      });
    },
    async get(request: Request,runId: string) {
      const requestId = crypto.randomUUID();let outcome:PublicErrorCode|'COMPLETED'='COMPLETED';
      return withTelemetry(requestId,()=>traceStage('http.status',async()=>{
        try {
          const identity=await dependencies.identity(request);if(!identity)throw new AdmissionError('UNAUTHENTICATED');
          const saved=await dependencies.load(identity,runId);bindRunTelemetry({runId:saved.runId});
          return Response.json(saved,{headers:headers(requestId)});
        }catch(error){outcome=error instanceof AdmissionError?error.code:'PROVIDER_UNAVAILABLE';return failure(outcome,requestId);}
      },()=>({outcome})));
    },
  };
}
