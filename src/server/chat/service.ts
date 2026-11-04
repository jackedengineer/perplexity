import "server-only";
import { z } from "zod";
import { getDb } from "@/db";
import { getCurrentSession } from "@/lib/current-session";
import { getServerEnv } from "@/lib/env";
import { parsePlannerModel } from "@/server/ai/models";
import {catalogConfiguration,MODEL_CATALOG,extendedAnswerBudget} from "@/server/ai/catalog";
import {createPlannerProvider} from '@/server/ai/planner-provider';
import { createChatProvider } from "@/server/ai/chat-provider";
import { createAnswerProvider } from "@/server/ai/answer";
import { createLocalSafetyGuard } from "@/server/safety/local";
import {createTavilyExtract} from "@/server/search/extract";
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
    function configureExecution(modelKey:string,mode:"FAST"|"CHAT") {
      const answer=catalogConfiguration(modelKey,process.env),planner=parsePlannerModel(process.env);
      const searchKey=z.string().min(16).max(512).regex(/^[A-Za-z0-9._-]+$/u).safeParse(process.env.TAVILY_API_KEY);
      if(!planner||!answer||!searchKey.success)throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
      return createRunExecution(db,keys,{
        extract:createTavilyExtract(searchKey.data),planner:createPlannerProvider(planner),input:createLocalSafetyGuard(),query:createLocalSafetyGuard(),
        evidence:createLocalSafetyGuard(),output:createLocalSafetyGuard(),
        answer:(mode === "CHAT" ? createChatProvider : createAnswerProvider)(answer,fetch,MODEL_CATALOG.find(m=>m.key===modelKey)!.maxOutputTokens,12000,extendedAnswerBudget(modelKey)),search:createTavilySearch(searchKey.data),
      });
    }
    let execution:ReturnType<typeof configureExecution>|undefined;
    const admission=createRunAdmission(db,keys,parseAdmissionPolicyEnvironment(process.env),(key,mode)=>{execution=configureExecution(key,mode);},true);
    return {admit:admission.admit,execute:(...args)=>{
      if(!execution)throw new AdmissionError("CONFIGURATION_UNAVAILABLE");
      return execution.execute(...args);
    },load:createAnswerDelivery(db).load};
  },
  log: event=>console.info(JSON.stringify(event)),
});
