import { randomUUID } from "node:crypto";
import * as schema from "@/db/schema";
import type { AdmissionDatabase } from "@/server/runs/usage";
import { createRunAdmission } from "@/server/runs/admit";
import { FREE_ADMISSION_POLICY } from "@/server/runs/policy";
import { createMessageAcceptance } from "@/server/runs/accept-message";
import { createProviderCalls,recordSafetyProvider,recordSearchProvider } from "@/server/runs/provider-calls";
import { createInputGate } from "@/server/safety/input";
import { createEvidenceGate } from "@/server/safety/evidence";
import { createRetrieval } from "@/server/search/retrieve";
export const allow = { decision: "ALLOW",categoryCodes: [],policyVersion: "v1" };
export const knownUsage = { costMicroUsd: 100n,inputTokens: 10,outputTokens: 5,actualModel: "test/safety" };
export const fakeSafety = () => ({ modelId: "test/safety",classify: async()=>allow,usage: ()=>knownUsage });
export const keys = { activeKeyId: "test-v1",keys: { "test-v1": "a".repeat(64) } };
export async function seedCompletion(db: AdmissionDatabase,reserve = 50000n) {
  const subject = randomUUID(),namespace = `completion-${randomUUID()}`;
  await db.insert(schema.user).values({ id: subject,name: "Synthetic completion",email: `${subject}@example.test` });
  const [profile] = await db.insert(schema.appUsers).values({ authSubject: subject }).returning();
  const [conversation] = await db.insert(schema.conversations).values({ userId: profile.id,creationRequestId: randomUUID(),creationFingerprint: "synthetic",title: "Synthetic completion" }).returning();
  for (const kind of ["PERIOD","DAY"] as const) {
    const window = { startsAt: new Date(Date.now()-86400000),endsAt: new Date(Date.now()+86400000) };
    await db.insert(schema.usageBuckets).values({ userId: profile.id,kind,...window,entitlementVersion: "test-v1",creditLimit: 10,providerLimitMicroUsd: 100000n });
    await db.insert(schema.operatorUsageBuckets).values({ budgetKey: namespace,kind,...window,providerLimitMicroUsd: 100000n });
  }
  const request = { conversationId: conversation.id,clientRequestId: randomUUID(),expectedRevision: 0,mode: "FAST",modelKey: "fast-default",message: { text: "Why do rainbows form?" } };
  const admitted = await createRunAdmission(db,keys,{ ...FREE_ADMISSION_POLICY,operatorBudgetKey: namespace,providerReserveMicroUsd: reserve }).admit(subject,request);
  if (admitted.kind !== "ADMITTED") throw new Error("Synthetic admission failed");
  return { subject,profile,conversation,request,runId: admitted.run.id };
}
export async function prepareCompletion(db: AdmissionDatabase,person: { subject: string;runId: string;request: unknown },hmacKeys: unknown = keys,empty = false) {
  const calls = createProviderCalls(db,person.subject,person.runId);
  const accepted = await createMessageAcceptance(db,hmacKeys,createInputGate(recordSafetyProvider(calls,"INPUT_SAFETY",fakeSafety()))).accept(person.subject,person.runId,person.request,new AbortController().signal);
  if (accepted.kind !== "ACCEPTED") throw new Error("Synthetic input failed");
  const search = recordSearchProvider(calls,{ search: async()=>({ results: empty ? [] : [{ title: "Rainbow evidence",url: "https://example.org/rainbows",content: "Water refracts sunlight.",score: 0.9 }],credits: 1 }) });
  const retrieval = createRetrieval(db,{ modelId: "test/safety",search,queryGate: createInputGate(recordSafetyProvider(calls,"QUERY_SAFETY",fakeSafety())),evidenceGate: createEvidenceGate(recordSafetyProvider(calls,"EVIDENCE_SAFETY",fakeSafety())) });
  const retrieved = await retrieval.retrieve(person.subject,person.runId,new AbortController().signal);
  if (retrieved.kind !== "READY" && retrieved.kind !== "NO_EVIDENCE") throw new Error("Synthetic retrieval failed");
  return { calls,retrieval };
}

export async function completionSession(db: AdmissionDatabase,subject: string) {
  const sessionId = randomUUID(),token = randomUUID();
  await db.insert(schema.session).values({ id: sessionId,token,userId: subject,expiresAt: new Date(Date.now()+86400000),createdAt: new Date(),updatedAt: new Date() });
  return { sessionId,token };
}
