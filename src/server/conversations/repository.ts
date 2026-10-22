import { SAFETY_POLICY } from "@/server/safety/policy";
import { createHash } from "node:crypto";
import { and, desc, eq, ilike, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { appUsers, conversations, messages } from "@/db/schema";
import { encodeCursor, type Conversation, type CreateInput, type HistoryInput, type ListInput } from "./contracts";
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
  const owned = (authSubject: string) => inArray(conversations.userId,
    db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.authSubject, authSubject)));

  async function get(authSubject: string, id: string) {
    const [row] = await db.select(fields).from(conversations).where(and(owned(authSubject), eq(conversations.id, id))).limit(1);
    if (!row) throw new ConversationError("NOT_FOUND");
    return serialize(row);
  }

  return {
    get,
    async create(authSubject: string, input: CreateInput) {
      const fingerprint = createHash("sha256").update(input.title).digest("hex");
      return db.transaction(async (tx) => {
        await tx.insert(appUsers).values({ authSubject }).onConflictDoNothing({ target: appUsers.authSubject });
        const [profile] = await tx.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.authSubject, authSubject));
        const inserted = await tx.insert(conversations).values({
          userId: profile.id, creationRequestId: input.clientRequestId, creationFingerprint: fingerprint, title: input.title,
        }).onConflictDoNothing({ target: [conversations.userId, conversations.creationRequestId] }).returning(fields);
        if (inserted[0]) return { conversation: serialize(inserted[0]), created: true };
        const [existing] = await tx.select({ ...fields, fingerprint: conversations.creationFingerprint }).from(conversations)
          .where(and(eq(conversations.userId, profile.id), eq(conversations.creationRequestId, input.clientRequestId)));
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
      const [row] = await db.update(conversations).set({
        title: input.title, revision: sql`${conversations.revision} + 1`, updatedAt: new Date(),
      }).where(and(owned(authSubject), eq(conversations.id, id), eq(conversations.revision, input.expectedRevision))).returning(fields);
      if (row) return serialize(row);
      await get(authSubject, id); // Foreign and nonexistent IDs have the same public response.
      throw new ConversationError("CONFLICT");
    },
    async history(authSubject: string, id: string, input: HistoryInput) {
      const conversation = await get(authSubject, id);
      const rows = await db.select({
        id: messages.id, role: messages.role, kind: messages.kind, parts: messages.parts,
        sequence: messages.sequence, schemaVersion: messages.schemaVersion, createdAt: messages.createdAt,
      }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id)).where(and(
        owned(authSubject), eq(messages.conversationId, id),
        or(eq(messages.role, "USER"), and(isNotNull(messages.approvedAt),eq(messages.policyVersion,SAFETY_POLICY.version))),
        input.before ? lt(messages.sequence, input.before) : undefined,
      )).orderBy(desc(messages.sequence)).limit(input.limit + 1);
      const items = rows.slice(0, input.limit).reverse().map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
      return { conversation, items, nextBefore: rows.length > input.limit ? items[0].sequence : null };
    },
  };
}
export type ConversationRepository = ReturnType<typeof createConversationRepository>;
