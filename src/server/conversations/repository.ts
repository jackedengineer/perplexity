import { presentAnswer } from "@/server/answers/presentation";
import { serializeApprovedPayload } from "@/server/ai/approved-payload";
import { SAFETY_POLICY } from "@/server/safety/policy";
import { createHash } from "node:crypto";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { ACTIVE_RUN_STATUSES, appUsers, conversations, messages, messageFeedback, outputReviews, runs } from "@/db/schema";
import { encodeCursor, type Conversation, type CreateInput, type HistoryInput, type ListInput } from "./contracts";
import { historyPageView } from "./views";
import { createConversationPrivacy } from "./privacy";
import { ConversationError } from "./errors";

const fields = {
  id: conversations.id, title: conversations.title, revision: conversations.revision,
  createdAt: conversations.createdAt, updatedAt: conversations.updatedAt,
};
type Row = Omit<Conversation, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date };
const serialize = (row: Row): Conversation => ({
  id: row.id, title: row.title, revision: row.revision,
  createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});

export function createConversationRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  const owned = (authSubject: string) => and(isNull(conversations.deletedAt), inArray(conversations.userId,
    db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.authSubject, authSubject))));

  async function get(authSubject: string, id: string) {
    const [row] = await db.select(fields).from(conversations).where(and(owned(authSubject), eq(conversations.id, id))).limit(1);
    if (!row) throw new ConversationError("NOT_FOUND");
    return serialize(row);
  }

  return {
    ...createConversationPrivacy(db),
    get,
    async exportData(subject: string, id: string): Promise<{schemaVersion:number;exportedAt:string;conversation:Conversation;messages:import("./views").HistoryPage["items"];feedback:{messageId:string;rating:string;reason:string|null}[]}> {
      return db.transaction(async tx => {
        const reader = createConversationRepository(tx);
        const first = await reader.history(subject,id,{limit:50});
        const items = [...historyPageView.parse(first).items];
        let before = first.nextBefore;
        while (before !== null) {
          if (items.length >= 1000) throw new ConversationError("TOO_LARGE");
          const page = await reader.history(subject,id,{limit:50,before});
          items.unshift(...historyPageView.parse(page).items); before = page.nextBefore;
        }
        const feedback = await tx.select({messageId:messageFeedback.messageId,rating:messageFeedback.rating,reason:messageFeedback.reason}).from(messageFeedback).innerJoin(conversations,eq(conversations.id,messageFeedback.conversationId)).where(and(owned(subject),eq(conversations.id,id)));
        return {schemaVersion:1,exportedAt:new Date().toISOString(),conversation:first.conversation,messages:items,feedback};
      },{isolationLevel:"repeatable read",accessMode:"read only"});
    },
    async create(authSubject: string, input: CreateInput) {
      const fingerprint = createHash("sha256").update(input.title).digest("hex");
      return db.transaction(async (tx) => {
        await tx.insert(appUsers).values({ authSubject }).onConflictDoNothing({ target: appUsers.authSubject });
        const [profile] = await tx.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.authSubject, authSubject));
        const inserted = await tx.insert(conversations).values({
          userId: profile.id, creationRequestId: input.clientRequestId, creationFingerprint: fingerprint, title: input.title,
        }).onConflictDoNothing({ target: [conversations.userId, conversations.creationRequestId] }).returning(fields);
        if (inserted[0]) return { conversation: serialize(inserted[0]), created: true };
        const [existing] = await tx.select({ ...fields, deletedAt: conversations.deletedAt, fingerprint: conversations.creationFingerprint }).from(conversations)
          .where(and(eq(conversations.userId, profile.id), eq(conversations.creationRequestId, input.clientRequestId)));
        if (existing.deletedAt) throw new ConversationError("NOT_FOUND");
        if (existing.fingerprint !== fingerprint) throw new ConversationError("IDEMPOTENCY_MISMATCH");
        return { conversation: serialize(existing), created: false };
      });
    },
    async list(authSubject: string, input: ListInput) {
      const after = input.cursor;
      const pattern = `%${input.q.replace(/[\\%_]/gu, "\\$&")}%`;
      const rows = await db.select(fields).from(conversations).where(and(
        owned(authSubject), input.q ? ilike(conversations.title, pattern) : undefined,
        after ? or(lt(conversations.updatedAt, new Date(after.updatedAt)),
          and(eq(conversations.updatedAt, new Date(after.updatedAt)), lt(conversations.id, after.id))) : undefined,
      )).orderBy(desc(conversations.updatedAt), desc(conversations.id)).limit(input.limit + 1);
      const items = rows.slice(0, input.limit).map(serialize);
      const last = items.at(-1);
      return { items, nextCursor: rows.length > input.limit && last ? encodeCursor({ updatedAt: last.updatedAt, id: last.id }) : null };
    },
    async rename(authSubject: string, id: string, input: { title: string; expectedRevision: number }) {
      return db.transaction(async tx=>{
        await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
        // Admission/completion lock this same row. Read active runs only after acquiring it,
        // so an admission that committed while we waited cannot invalidate its own fence.
        const [current]=await tx.select(fields).from(conversations).where(and(owned(authSubject),eq(conversations.id,id))).for("update");
        if(!current)throw new ConversationError("NOT_FOUND");
        const active=await tx.select({id:runs.id}).from(runs).where(and(eq(runs.conversationId,id),inArray(runs.status,[...ACTIVE_RUN_STATUSES]))).limit(1);
        if(active.length)throw new ConversationError("RUN_IN_PROGRESS");
        if(current.revision!==input.expectedRevision)throw new ConversationError("CONFLICT");
        const [row]=await tx.update(conversations).set({title:input.title,revision:current.revision+1,updatedAt:new Date()}).where(eq(conversations.id,id)).returning(fields);
        return serialize(row);
      });
    },
    async history(authSubject: string, id: string, input: HistoryInput) {
      const conversation = await get(authSubject, id);
      const rows = await db.select({
        id: messages.id, role: messages.role, kind: messages.kind, parts: messages.parts,
        sequence: messages.sequence, schemaVersion: messages.schemaVersion, createdAt: messages.createdAt,
        review: outputReviews.payload, bodyHash: outputReviews.bodyHash,payloadHash: outputReviews.payloadHash,reviewDecision: outputReviews.decision,runStatus: runs.status,
      }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .leftJoin(outputReviews,eq(outputReviews.messageId,messages.id)).leftJoin(runs,eq(runs.id,outputReviews.runId)).where(and(
        owned(authSubject), eq(messages.conversationId, id),
        or(eq(messages.role, "USER"), and(isNotNull(messages.approvedAt),eq(messages.policyVersion,SAFETY_POLICY.version))),
        input.before ? lt(messages.sequence, input.before) : undefined,
      )).orderBy(desc(messages.sequence)).limit(input.limit + 1);
      const items = rows.slice(0, input.limit).reverse().map(({ review,bodyHash,payloadHash,reviewDecision,runStatus,...row }) => {
        if (!reviewDecision) return { ...row,answer: undefined,createdAt: row.createdAt.toISOString() };
        try {
          const canonical = serializeApprovedPayload(review);
          if (reviewDecision !== "ALLOW" || !["COMPLETED","NEEDS_CLARIFICATION"].includes(runStatus??"") || canonical.bodyHash !== bodyHash || canonical.payloadHash !== payloadHash ||
            row.parts.length !== 1 || canonical.payload.markdown !== row.parts[0].text) throw new Error("Invalid saved answer");
          return { ...row,answer: presentAnswer(canonical.payload),createdAt: row.createdAt.toISOString() };
        } catch { throw new ConversationError("UNAVAILABLE"); }
      });
      return { conversation, items, nextBefore: rows.length > input.limit ? items[0].sequence : null };
    },
  };
}
export type ConversationRepository = ReturnType<typeof createConversationRepository>;
