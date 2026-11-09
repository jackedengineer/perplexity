import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, pgEnum, pgTable, smallint, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { appUsers, messages } from "./conversation-schema";
import { runs } from "./run-schema";
const instant = (name: string) => timestamp(name,{ withTimezone: true,precision: 3 });

// PROFILE: who the user is. PREFERENCE: how they want answers. CONTEXT: what they're working on.
export const memoryKind = pgEnum("memory_kind",["PROFILE","PREFERENCE","CONTEXT"]);
export const MEMORY_LIMITS = Object.freeze({ perUser: 50,textCharacters: 200,instructionsCharacters: 1000,readerCharacters: 2000,extractionsPerDay: 100 });

// Created lazily on first use. The extraction write locks this row so concurrent answers
// can't push a user past the memory cap.
export const memorySettings = pgTable("memory_settings",{
  userId: uuid("user_id").primaryKey().references(()=>appUsers.id,{ onDelete: "cascade" }),
  paused: boolean("paused").notNull().default(false),
  instructions: varchar("instructions",{ length: 1000 }),
  updatedAt: instant("updated_at").notNull(),
},t=>[
  check("memory_settings_valid",sql`${t.instructions} IS NULL OR length(trim(${t.instructions})) > 0`),
]);

// Facts a user stated about themselves. They belong to the user, not to a conversation:
// deleting the conversation only clears source_message_id.
export const memories = pgTable("memories",{
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(()=>appUsers.id,{ onDelete: "cascade" }),
  kind: memoryKind("kind").notNull(),
  text: varchar("text",{ length: 200 }).notNull(),
  sourceMessageId: uuid("source_message_id").references(()=>messages.id,{ onDelete: "set null" }),
  createdAt: instant("created_at").notNull(),
  updatedAt: instant("updated_at").notNull(),
},t=>[
  uniqueIndex("memories_owner_text_unique").on(t.userId,sql`lower(regexp_replace(trim(${t.text}), '\\s+', ' ', 'g'))`),
  index("memories_owner_created_idx").on(t.userId,t.createdAt),
  check("memories_valid",sql`length(trim(${t.text})) BETWEEN 3 AND 200`),
]);

// One extraction per completed run, with its cost. Kept apart from the run's own provider
// calls so memory can never consume the run's reserve. Holds counts, never memory text.
export const memoryExtractions = pgTable("memory_extractions",{
  runId: uuid("run_id").primaryKey().references(()=>runs.id,{ onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(()=>appUsers.id,{ onDelete: "cascade" }),
  status: varchar("status",{ length: 16 }).notNull(),
  model: varchar("model",{ length: 128 }).notNull(),
  costMicroUsd: bigint("cost_micro_usd",{ mode: "bigint" }),
  operations: smallint("operations").notNull().default(0),
  createdAt: instant("created_at").notNull(),
  finishedAt: instant("finished_at"),
},t=>[
  index("memory_extractions_owner_created_idx").on(t.userId,t.createdAt),
  check("memory_extractions_valid",sql`${t.status} IN ('STARTED','SUCCEEDED','FAILED','UNKNOWN') AND ${t.operations} BETWEEN 0 AND 3 AND (${t.costMicroUsd} IS NULL OR ${t.costMicroUsd} >= 0) AND (${t.status} = 'STARTED') = (${t.finishedAt} IS NULL)`),
]);
