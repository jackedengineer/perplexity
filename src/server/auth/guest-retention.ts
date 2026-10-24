import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { appUsers, conversations, guestLinks, session, user } from "@/db/schema";
import { ConversationError } from "@/server/conversations/errors";
import { createConversationPrivacy } from "@/server/conversations/privacy";
import type { AdmissionDatabase } from "@/server/runs/usage";

// Financial records and the trial-abuse marker survive content expiry. Linking
// takes the same owner lock as deletion, so a transferred conversation is safe.
export async function cleanExpiredGuests(db: AdmissionDatabase, deadline: number) {
  if (performance.now() >= deadline) return { conversations: 0 };
  const expired = await db.select({ subject: user.id, id: conversations.id })
    .from(user).innerJoin(appUsers, eq(appUsers.authSubject, user.id))
    .innerJoin(conversations, eq(conversations.userId, appUsers.id))
    .leftJoin(guestLinks, eq(guestLinks.guestId, appUsers.id))
    .where(and(eq(user.isAnonymous, true),
      lt(user.createdAt, sql`clock_timestamp() - interval '30 days'`),
      isNull(guestLinks.guestId), isNull(conversations.deletedAt)))
    .orderBy(user.createdAt, conversations.id).limit(20);
  let removed = 0;
  for (const item of expired) {
    if (performance.now() >= deadline) break;
    try {
      await createConversationPrivacy(db).remove(item.subject, item.id);
      await db.delete(session).where(eq(session.userId, item.subject));
      removed++;
    } catch (error) {
      // Linking between selection and deletion transfers ownership atomically.
      if (!(error instanceof ConversationError && error.code === "NOT_FOUND")) throw error;
    }
  }
  return { conversations: removed };
}
