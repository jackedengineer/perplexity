import { and,asc,desc,eq,inArray,sql } from "drizzle-orm";
import { appUsers,conversations,memories,memorySettings,user,MEMORY_LIMITS } from "@/db/schema";
import type { AdmissionDatabase,AdmissionTransaction } from "@/server/runs/usage";
import { AdmissionError } from "@/server/runs/errors";

export type MemoryKind = "PROFILE" | "PREFERENCE" | "CONTEXT";
export type StoredMemory = { id: string; kind: MemoryKind; text: string };
export type MemoryOperation =
  | { op: "ADD"; kind: MemoryKind; text: string }
  | { op: "UPDATE"; id: string; text: string }
  | { op: "DELETE"; id: string };
export type Reader = { instructions?: string; memories: string[] };
export type MemorySettingsView = { paused: boolean; instructions: string | null };
type Database = AdmissionDatabase | AdmissionTransaction;

// Matches the memories_owner_text_unique index, so a duplicate is caught before the insert.
export const memoryText = (text: string) => text.trim().replace(/\s+/gu," ");
const sameText = (a: string,b: string) => memoryText(a).toLowerCase() === memoryText(b).toLowerCase();

// Preferences shape every answer, so they go first; ongoing context is the first to drop.
const KIND_ORDER: Record<MemoryKind,number> = { PREFERENCE: 0,PROFILE: 1,CONTEXT: 2 };

// Memory is for signed-in people only. Guests and unknown subjects are refused.
async function owner(db: Database,subject: string) {
  const [row] = await db.select({ id: appUsers.id,guest: user.isAnonymous }).from(appUsers)
    .innerJoin(user,eq(user.id,appUsers.authSubject)).where(eq(appUsers.authSubject,subject));
  if (!row || row.guest) throw new AdmissionError("UNAUTHENTICATED");
  return row.id;
}

export async function getSettings(db: Database,subject: string): Promise<MemorySettingsView> {
  const userId = await owner(db,subject);
  const [row] = await db.select().from(memorySettings).where(eq(memorySettings.userId,userId));
  return { paused: row?.paused ?? false,instructions: row?.instructions ?? null };
}

export async function updateSettings(db: Database,subject: string,patch: { paused?: boolean; instructions?: string | null }): Promise<MemorySettingsView> {
  const userId = await owner(db,subject),now = new Date();
  const changes = {
    ...(patch.paused === undefined ? {} : { paused: patch.paused }),
    ...(patch.instructions === undefined ? {} : { instructions: patch.instructions?.trim() || null }),
  };
  const [row] = await db.insert(memorySettings).values({ userId,...changes,updatedAt: now })
    .onConflictDoUpdate({ target: memorySettings.userId,set: { ...changes,updatedAt: now } }).returning();
  return { paused: row.paused,instructions: row.instructions };
}

// Permanent. About you is kept; it is cleared by saving it empty. Takes the same lock as
// applyOperations and bumps updated_at, so an extraction still in flight can't write back afterwards.
export async function deleteAllMemories(db: AdmissionDatabase,subject: string) {
  const userId = await owner(db,subject);
  return db.transaction(async tx => {
    const now = new Date();
    await tx.insert(memorySettings).values({ userId,updatedAt: now }).onConflictDoNothing();
    await tx.select({ userId: memorySettings.userId }).from(memorySettings).where(eq(memorySettings.userId,userId)).for("update");
    await tx.update(memorySettings).set({ updatedAt: now }).where(eq(memorySettings.userId,userId));
    return (await tx.delete(memories).where(eq(memories.userId,userId)).returning({ id: memories.id })).length;
  });
}

export async function listMemories(db: Database,userId: string): Promise<StoredMemory[]> {
  return db.select({ id: memories.id,kind: memories.kind,text: memories.text }).from(memories)
    .where(eq(memories.userId,userId)).orderBy(desc(memories.createdAt),asc(memories.id));
}

// About you first, then memories by kind and recency, whole items only, within the character budget.
export function fitReader(instructions: string | null,items: Array<StoredMemory & { createdAt?: Date }>,budget: number = MEMORY_LIMITS.readerCharacters): Reader | null {
  let used = instructions?.length ?? 0;
  const chosen: string[] = [];
  const ordered = [...items].sort((a,b) => KIND_ORDER[a.kind]-KIND_ORDER[b.kind] || (b.createdAt?.getTime() ?? 0)-(a.createdAt?.getTime() ?? 0));
  for (const item of ordered) {
    if (used+item.text.length > budget) continue;
    chosen.push(item.text);
    used += item.text.length;
  }
  if (!instructions && !chosen.length) return null;
  return { ...(instructions ? { instructions } : {}),memories: chosen };
}

// What the answer may know about the asker. Null for guests and temporary chats; About you alone while paused.
export async function loadReader(db: Database,userId: string,conversationId: string): Promise<Reader | null> {
  const [state] = await db.select({ guest: user.isAnonymous,paused: memorySettings.paused,instructions: memorySettings.instructions,enabled: conversations.memoryEnabled })
    .from(conversations).innerJoin(appUsers,eq(appUsers.id,conversations.userId)).innerJoin(user,eq(user.id,appUsers.authSubject))
    .leftJoin(memorySettings,eq(memorySettings.userId,appUsers.id))
    .where(and(eq(conversations.id,conversationId),eq(conversations.userId,userId)));
  if (!state || state.guest || !state.enabled) return null;
  if (state.paused) return state.instructions ? { instructions: state.instructions,memories: [] } : null;
  const items = await db.select({ id: memories.id,kind: memories.kind,text: memories.text,createdAt: memories.createdAt }).from(memories)
    .where(eq(memories.userId,userId)).orderBy(desc(memories.createdAt)).limit(MEMORY_LIMITS.perUser);
  return fitReader(state.instructions,items);
}

// Applies already-validated operations. Serialized per user on the settings row, so two answers
// finishing together can't push past the cap. With startedAt, nothing is written if the settings
// changed after the extraction began: a pause or Delete all always wins over a late extraction.
export async function applyOperations(db: AdmissionDatabase,userId: string,operations: readonly MemoryOperation[],sourceMessageId: string | null,startedAt?: Date) {
  if (!operations.length) return 0;
  return db.transaction(async tx => {
    const now = new Date();
    await tx.insert(memorySettings).values({ userId,updatedAt: now }).onConflictDoNothing();
    const [settings] = await tx.select({ paused: memorySettings.paused,updatedAt: memorySettings.updatedAt }).from(memorySettings).where(eq(memorySettings.userId,userId)).for("update");
    if (settings.paused || startedAt && settings.updatedAt > startedAt) return 0;
    let current = await tx.select({ id: memories.id,kind: memories.kind,text: memories.text,createdAt: memories.createdAt }).from(memories)
      .where(eq(memories.userId,userId)).orderBy(asc(memories.createdAt),asc(memories.id));
    let applied = 0;
    for (const operation of operations) {
      if (operation.op === "DELETE") {
        const removed = await tx.delete(memories).where(and(eq(memories.id,operation.id),eq(memories.userId,userId))).returning({ id: memories.id });
        if (removed.length) { current = current.filter(m => m.id !== operation.id); applied++; }
        continue;
      }
      const text = memoryText(operation.text);
      if (operation.op === "UPDATE") {
        if (current.some(m => m.id !== operation.id && sameText(m.text,text))) continue;
        const changed = await tx.update(memories).set({ text,updatedAt: now }).where(and(eq(memories.id,operation.id),eq(memories.userId,userId))).returning({ id: memories.id });
        if (changed.length) { current = current.map(m => m.id === operation.id ? { ...m,text } : m); applied++; }
        continue;
      }
      if (current.some(m => sameText(m.text,text))) continue;
      const [added] = await tx.insert(memories).values({ userId,kind: operation.kind,text,sourceMessageId,createdAt: now,updatedAt: now })
        .onConflictDoNothing().returning({ id: memories.id,kind: memories.kind,text: memories.text,createdAt: memories.createdAt });
      if (!added) continue;
      // Evict only once the new memory is in, so a rejected insert never costs an old memory.
      if (current.length >= MEMORY_LIMITS.perUser) {
        const evicted = current.find(m => m.kind === "CONTEXT") ?? current[0];
        await tx.delete(memories).where(inArray(memories.id,[evicted.id]));
        current = current.filter(m => m.id !== evicted.id);
      }
      current.push(added);
      applied++;
    }
    return applied;
  });
}

export const memoryCount = async (db: Database,userId: string) =>
  (await db.select({ n: sql<number>`count(*)::integer` }).from(memories).where(eq(memories.userId,userId)))[0].n;
