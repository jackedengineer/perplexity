import "server-only";
import { z } from "zod";
import { getDb } from "@/db";
import { getCurrentSession } from "@/lib/current-session";
import { getServerEnv } from "@/lib/env";
import { parseAnswerModel,parsePlannerModel,parseSafetyModel } from "@/server/ai/models";
import {createPlannerProvider} from '@/server/ai/planner-provider';
import { createAnswerProvider } from "@/server/ai/answer";
import { createOpenRouterSafetyProvider } from "@/server/safety/openrouter";
import { EVIDENCE_SAFETY_PROMPT } from "@/server/safety/evidence";
import { OUTPUT_SAFETY_PROMPT } from "@/server/safety/output";
import { createTavilySearch } from "@/server/search/tavily";
import { createRunAdmission } from "@/server/runs/admit";
import { parseAdmissionEnvironment,parseAdmissionPolicyEnvironment } from "@/server/runs/env";
import { AdmissionError } from "@/server/runs/errors";
import { createRunExecution } from "@/server/runs/execute";
import { createAnswerDelivery } from "./delivery";
import { createChatHttp } from "./http";
import { createRequestLimiter } from "@/server/runs/rate-limit";
export const chatHttp = createChatHttp({
  identity: getCurrentSession,origin: ()=>getServerEnv().BETTER_AUTH_URL,
  consumeRequest: subject=>createRequestLimiter(getDb(),parseAdmissionPolicyEnvironment(process.env).operatorBudgetKey).consume(subject),
  load: (identity,runId)=>createAnswerDelivery(getDb()).load(identity,runId),
  backend() {
    const db = getDb(),keys = parseAdmissionEnvironment(process.env);
    function configureExecution() {
      const safety=parseSafetyModel(process.env),answer=parseAnswerModel(process.env),planner=parsePlannerModel(process.env);
      const searchKey=z.string().min(16).max(512).regex(/^[A-Za-z0-9._-]+$/u).safeParse(process.env.TAVILY_API_KEY);
      if(!planner||!safety||!answer||!searchKey.success)throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
      return createRunExecution(db,keys,{
        planner:createPlannerProvider(planner),input:createOpenRouterSafetyProvider(safety),query:createOpenRouterSafetyProvider(safety),
        evidence:createOpenRouterSafetyProvider(safety,fetch,EVIDENCE_SAFETY_PROMPT),output:createOpenRouterSafetyProvider(safety,fetch,OUTPUT_SAFETY_PROMPT),
        answer:createAnswerProvider(answer),search:createTavilySearch(searchKey.data),
      });
    }
    let execution:ReturnType<typeof configureExecution>|undefined;
    const admission=createRunAdmission(db,keys,parseAdmissionPolicyEnvironment(process.env),()=>{execution=configureExecution();});
    return {admit:admission.admit,execute:(...args)=>{
      if(!execution)throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
      return execution.execute(...args);
    },load:createAnswerDelivery(db).load};
  },
  log: event=>console.info(JSON.stringify(event)),
});
