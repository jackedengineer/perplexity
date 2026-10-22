import { sql } from "drizzle-orm";
import { check, foreignKey, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { messages, messageRole } from "./conversation-schema";
import { runs } from "./run-schema";
import { INPUT_REASONS } from "@/server/safety/provider";

export const inputSafetyDecision = pgEnum("input_safety_decision",["ALLOW","BLOCK","UNAVAILABLE"]);
export const inputSafetyReason = pgEnum("input_safety_reason",INPUT_REASONS);
export const inputSafetyReviews = pgTable("input_safety_reviews",{
  runId: uuid("run_id").primaryKey(), conversationId: uuid("conversation_id").notNull(), attemptVersion: integer("attempt_version").notNull(),
  decision: inputSafetyDecision("decision").notNull(), categoryCodes: text("category_codes").array().notNull().default(sql`ARRAY[]::text[]`),
  reason: inputSafetyReason("reason").notNull(), detectorVersion: varchar("detector_version",{ length: 64 }).notNull(),
  policyVersion: varchar("policy_version",{ length: 32 }).notNull(), modelId: varchar("model_id",{ length: 128 }), durationMs: integer("duration_ms").notNull(),
  acceptedMessageId: uuid("accepted_message_id"), acceptedMessageRole: messageRole("accepted_message_role").notNull().default("USER"),
  createdAt: timestamp("created_at",{ withTimezone: true,precision: 3 }).notNull().defaultNow(),
},(t)=>[
  foreignKey({ columns: [t.runId,t.conversationId], foreignColumns: [runs.id,runs.conversationId], name: "input_review_owned_run_fk" }).onDelete("cascade"),
  // Reviewed SQL defers this FK so the ALLOW review can precede the RLS-checked question insert.
  foreignKey({ columns: [t.acceptedMessageId,t.conversationId,t.acceptedMessageRole], foreignColumns: [messages.id,messages.conversationId,messages.role], name: "input_review_accepted_message_fk" }).onDelete("cascade"),
  uniqueIndex("input_review_message_unique").on(t.acceptedMessageId),
  check("input_review_metadata_valid",sql`${t.attemptVersion} > 0 AND ${t.durationMs} >= 0 AND length(trim(${t.detectorVersion})) > 0 AND length(trim(${t.policyVersion})) > 0 AND (${t.modelId} IS NULL OR length(trim(${t.modelId})) > 0)`),
  check("input_review_message_valid",sql`${t.acceptedMessageRole} = 'USER' AND ((${t.decision} = 'ALLOW' AND ${t.acceptedMessageId} IS NOT NULL) OR (${t.decision} <> 'ALLOW' AND ${t.acceptedMessageId} IS NULL))`),
  check("input_review_categories_valid",sql`array_position(${t.categoryCodes},NULL) IS NULL AND ${t.categoryCodes} <@ ARRAY['CREDENTIAL_THEFT','FRAUD','UNAUTHORIZED_INTRUSION','MALWARE','VIOLENCE','SEXUAL_EXPLOITATION','SELF_HARM_INSTRUCTIONS','SELF_HARM_DISTRESS','PRIVATE_DATA','ACCIDENTAL_SECRET','PROMPT_INJECTION']::text[] AND ((${t.decision} = 'BLOCK' AND cardinality(${t.categoryCodes}) BETWEEN 1 AND 11) OR (${t.decision} <> 'BLOCK' AND cardinality(${t.categoryCodes}) = 0))`),
]);
