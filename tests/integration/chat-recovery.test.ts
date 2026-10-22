import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {drizzle} from "drizzle-orm/pglite";
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from "vitest";
import * as schema from "@/db/schema";
import {seedCompletion,prepareCompletion,completionSession,fakeSafety,knownUsage,keys} from "../helpers/completion";
import {createAnswerCompletion} from "@/server/runs/complete";
vi.mock("server-only",()=>({}));
vi.mock("@/db",()=>({getDb:()=>db}));
vi.mock("@/lib/current-session",()=>({getCurrentSession:async()=>identity}));
vi.mock("@/lib/env",()=>({getServerEnv:()=>({BETTER_AUTH_URL:"http://localhost:3000"})}));
import {chatHttp} from "@/server/chat/service";
const pg=new PGlite(),db=drizzle(pg,{schema});
let person:Awaited<ReturnType<typeof seedCompletion>>,identity:{user:{id:string};sessionId:string};
beforeAll(async()=>{const journal=JSON.parse(await readFile("drizzle/meta/_journal.json","utf8"));for(const e of journal.entries)await pg.exec(await readFile(`drizzle/${e.tag}.sql`,"utf8"));});
beforeEach(async()=>{
  await db.delete(schema.user);await db.delete(schema.operatorUsageBuckets);
  person=await seedCompletion(db);identity={user:{id:person.subject},sessionId:(await completionSession(db,person.subject)).sessionId};
  vi.stubEnv("RUN_HMAC_ACTIVE_KEY_ID",keys.activeKeyId);vi.stubEnv("RUN_HMAC_KEYS_JSON",JSON.stringify(keys.keys));
  vi.stubEnv("OPENROUTER_API_KEY","");vi.stubEnv("TAVILY_API_KEY","");
});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>pg.close());
const post=()=>chatHttp.post(new Request("http://localhost:3000/api/chat",{method:"POST",headers:{origin:"http://localhost:3000","content-type":"application/json"},body:JSON.stringify(person.request)}));
it("returns an existing active intent despite unavailable providers",async()=>{
  const response=await post();expect(response.status).toBe(409);expect(response.headers.get("x-run-id")).toBe(person.runId);
  expect(await db.select().from(schema.providerCalls)).toHaveLength(0);
});
it("delivers a committed answer despite unavailable providers without another receipt",async()=>{
  await prepareCompletion(db,person);
  const model={modelId:"test/answer",generate:async()=>({text:"Water refracts sunlight [S1].",usage:knownUsage})};
  expect((await createAnswerCompletion(db,{answer:model,output:fakeSafety()}).complete(person.subject,identity.sessionId,person.runId,new AbortController().signal)).kind).toBe("COMMITTED");
  const calls=(await db.select().from(schema.providerCalls)).length;
  const response=await post();expect(response.status).toBe(200);expect(await response.text()).toContain("Water refracts sunlight");
  expect(await db.select().from(schema.providerCalls)).toHaveLength(calls);
  expect(await db.select().from(schema.runSettlements)).toHaveLength(1);
});
