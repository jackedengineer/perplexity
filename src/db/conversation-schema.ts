import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const appUsers = pgTable("app_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  authSubject: text("auth_subject").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => appUsers.id, { onDelete: "cascade" }),
  creationRequestId: uuid("creation_request_id").notNull(),
  creationFingerprint: text("creation_fingerprint").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  revision: integer("revision").notNull().default(0),
  nextSequence: integer("next_sequence").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("conversations_id_owner_unique").on(table.id, table.userId),
  uniqueIndex("conversations_owner_creation_unique").on(table.userId, table.creationRequestId),
  index("conversations_owner_updated_idx").on(table.userId, table.updatedAt.desc(), table.id.desc()),
  check("conversations_title_nonempty", sql`length(trim(${table.title})) > 0`),
  check("conversations_revision_nonnegative", sql`${table.revision} >= 0`),
  check("conversations_sequence_positive", sql`${table.nextSequence} > 0`),
]);

export const messageRole = pgEnum("message_role", ["USER", "ASSISTANT"]);
export const messageKind = pgEnum("message_kind", ["QUESTION", "ANSWER", "CLARIFICATION"]);
export type TextPart = { type: "text"; text: string };
export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: messageRole("role").notNull(),
  kind: messageKind("kind").notNull(),
  parts: jsonb("parts").$type<TextPart[]>().notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  sequence: integer("sequence").notNull(),
  policyVersion: text("policy_version"),
  approvedAt: timestamp("approved_at", { withTimezone: true, precision: 3 }),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  // Ownership remains in application queries; RLS protects the runtime write boundary.
  pgPolicy("messages_runtime_read", { for: "select", using: sql`true` }),
  pgPolicy("messages_reviewed_question_insert", { for: "insert", withCheck: sql`
    role = 'USER' AND kind = 'QUESTION' AND approved_at IS NOT NULL AND policy_version IS NOT NULL
    AND EXISTS (SELECT 1 FROM input_safety_reviews review WHERE review.accepted_message_id = messages.id
      AND review.conversation_id = messages.conversation_id AND review.decision = 'ALLOW'
      AND review.policy_version = messages.policy_version)` }),
  uniqueIndex("messages_id_conversation_role_unique").on(table.id, table.conversationId, table.role),
  uniqueIndex("messages_conversation_sequence_unique").on(table.conversationId, table.sequence),
  check("messages_sequence_positive", sql`${table.sequence} > 0`),
  check("messages_parts_array", sql`jsonb_typeof(${table.parts}) = 'array'`),
  check("messages_approval_policy", sql`${table.approvedAt} IS NULL OR ${table.policyVersion} IS NOT NULL`),
  check("messages_schema_version_positive", sql`${table.schemaVersion} > 0`),
  check("messages_role_kind", sql`(${table.role} = 'USER' AND ${table.kind} = 'QUESTION') OR (${table.role} = 'ASSISTANT' AND ${table.kind} IN ('ANSWER', 'CLARIFICATION'))`),
]).enableRLS();
