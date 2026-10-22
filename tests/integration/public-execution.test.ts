import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { submissionSchema } from "@/server/contracts/chat";
import { beforeAll,beforeEach,afterAll,expect,it,vi } from "vitest";
import * as schema from "@/db/schema";
import { seedCompletion,completionSession,fakeSafety,knownUsage,keys } from "../helpers/completion";
import { createRunExecution,type ExecutionProviders } from "@/server/runs/execute";
import { createAnswerDelivery } from "@/server/chat/delivery";
import { createRunAdmission } from "@/server/runs/admit";
import {SafetyProviderError} from '@/server/safety/provider';
const pg = new PGlite(),db = drizzle(pg,{schema});
let person: Awaited<ReturnType<typeof seedCompletion>>,identity: {user:{id:string};sessionId:string};
beforeAll(async()=>{const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));for(const e of journal.entries)await pg.exec(await readFile(`drizzle/${e.tag}.sql`,"utf8"));});
beforeEach(async()=>{await db.delete(schema.user);await db.delete(schema.operatorUsageBuckets);person=await seedCompletion(db);identity={user:{id:person.subject},sessionId:(await completionSession(db,person.subject)).sessionId};});
afterAll(()=>pg.close());
function providers(): ExecutionProviders {
  return {input:fakeSafety(),query:fakeSafety(),evidence:fakeSafety(),output:fakeSafety(),
    answer:{modelId:"test/answer",generate:vi.fn().mockResolvedValue({text:"Light bends in droplets [S1].",usage:knownUsage})},
    search:{search:vi.fn().mockResolvedValue({results:[{title:"Rainbow source",url:"https://weather.gov/rainbow",content:"Light bends in water droplets.",score:.9}],credits:1})}};
}
async function run(p: ExecutionProviders,signal=new AbortController().signal) {
  const admitted=await createRunAdmission(db,keys).admit(person.subject,person.request);if(admitted.kind==="DENIED")throw new Error("Synthetic admission missing");
  const stages:string[]=[];const result=await createRunExecution(db,keys,p).execute(identity,admitted.run,submissionSchema.parse(person.request),signal,s=>stages.push(s));return {result,stages};
}
it("executes all guards in order, commits, then exposes the same owned canonical answer",async()=>{
  const p=providers();await db.update(schema.conversations).set({title:"New search"}).where(eq(schema.conversations.id,person.conversation.id));
  const {result,stages}=await run(p);expect(result.kind).toBe("COMPLETED");expect(stages).toEqual(["SEARCHING","PREPARING_ANSWER","CHECKING_ANSWER","SAVING_ANSWER"]);
  const delivery=createAnswerDelivery(db),saved=await delivery.load(identity,person.runId);
  expect(saved).toMatchObject({state:"COMPLETED",answer:{text:"Light bends in droplets [S1].",answer:{sources:[{url:"https://weather.gov/rainbow"}]}}});
  expect((await db.select().from(schema.conversations))[0].title).toBe(person.request.message.text);
  expect(JSON.stringify(saved)).not.toMatch(/passageId|contentHash|payloadHash|costMicroUsd/);
  await expect(delivery.load({...identity,user:{id:"foreign"}},person.runId)).rejects.toMatchObject({code:"NOT_FOUND"});
});
it("input rejection publishes no research stages, performs no search/answer work and refunds credits",async()=>{
  const p=providers();p.input={...fakeSafety(),classify:async()=>({decision:"BLOCK",categoryCodes:["FRAUD"],policyVersion:"v1"})};
  const {result,stages}=await run(p);expect(result).toMatchObject({kind:"DENIED",code:"INPUT_BLOCKED"});expect(stages).toEqual([]);
  expect(p.search.search).not.toHaveBeenCalled();expect(p.answer.generate).not.toHaveBeenCalled();expect(await db.select().from(schema.messages)).toHaveLength(0);
  expect((await db.select().from(schema.runSettlements))[0]).toMatchObject({creditsCharged:0,knownProviderMicroUsd:100n});
});
it("output denial leaves no answer in status/history and preserves provider accounting",async()=>{
  const p=providers();p.output={...fakeSafety(),classify:async()=>({decision:"BLOCK",categoryCodes:["FRAUD"],policyVersion:"v1"})};
  expect((await run(p)).result).toMatchObject({kind:"DENIED",code:"OUTPUT_BLOCKED"});
  const status=await createAnswerDelivery(db).load(identity,person.runId);expect(status.state).toBe("UNAVAILABLE");expect(status.answer).toBeUndefined();
  expect(await db.select().from(schema.messages)).toHaveLength(1);expect((await db.select().from(schema.outputReviews))[0].payload).toBeNull();
  expect((await db.select().from(schema.runSettlements))[0].creditsCharged).toBe(0);
});
it("a search outage settles the admitted failure without leaking upstream diagnostics",async()=>{
  const p=providers();vi.mocked(p.search.search).mockRejectedValue(new Error("PRIVATE provider response"));
  expect((await run(p)).result).toMatchObject({kind:"DENIED",code:"PROVIDER_UNAVAILABLE"});expect(p.answer.generate).not.toHaveBeenCalled();
  expect((await db.select().from(schema.runSettlements))[0]).toMatchObject({creditsCharged:0,heldProviderMicroUsd:49800n});
});
it("logout during the input check stops the next paid search stage",async()=>{
  const p=providers();p.input={...fakeSafety(),classify:async()=>{await db.delete(schema.session).where(eq(schema.session.id,identity.sessionId));return {decision:"ALLOW",categoryCodes:[],policyVersion:"v1"};}};
  expect((await run(p)).result).toMatchObject({kind:"DENIED",code:"UNAUTHENTICATED"});expect(p.search.search).not.toHaveBeenCalled();expect(p.answer.generate).not.toHaveBeenCalled();
  await expect(createAnswerDelivery(db).load(identity,person.runId)).rejects.toMatchObject({code:"NOT_FOUND"});
});
it("revoked sessions cannot recover an already committed answer",async()=>{
  expect((await run(providers())).result.kind).toBe("COMPLETED");await db.delete(schema.session).where(eq(schema.session.id,identity.sessionId));
  await expect(createAnswerDelivery(db).load(identity,person.runId)).rejects.toMatchObject({code:"NOT_FOUND"});
});
it("a stopped admitted request becomes CANCELLED and never starts provider work",async()=>{
  const controller=new AbortController();controller.abort();const p=providers();
  expect((await run(p,controller.signal)).result.kind).toBe("DENIED");
  expect((await db.select().from(schema.runs))[0].status).toBe("CANCELLED");
  expect(p.search.search).not.toHaveBeenCalled();expect(p.answer.generate).not.toHaveBeenCalled();
  expect((await db.select().from(schema.runSettlements))[0].creditsCharged).toBe(0);
});
it.each(['input','query','evidence','output'] as const)('%s safety expiry returns a deadline outcome and persists TIMED_OUT',async stage=>{
 const p=providers();p[stage]={...fakeSafety(),classify:async()=>{throw new SafetyProviderError('TIMEOUT');}};
 expect((await run(p)).result).toEqual({kind:'DENIED',code:'DEADLINE_EXCEEDED'});
 expect((await db.select().from(schema.runs))[0].status).toBe('TIMED_OUT');
 expect((await db.select().from(schema.runSettlements))[0].creditsCharged).toBe(0);
});
it('answer cancellation remains cancellation rather than a fabricated deadline',async()=>{
 const controller=new AbortController(),p=providers();
 p.answer={modelId:'test/answer',generate:async()=>{controller.abort();throw new Error('PRIVATE');}};
 expect((await run(p,controller.signal)).result).toEqual({kind:'DENIED',code:'CONFLICT'});
 expect((await db.select().from(schema.runs))[0].status).toBe('CANCELLED');
});
