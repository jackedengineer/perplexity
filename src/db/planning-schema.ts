import {sql} from 'drizzle-orm';
import {pgTable,uuid,integer,varchar,jsonb,timestamp,foreignKey,check} from 'drizzle-orm/pg-core';
import {runs} from './run-schema';
import {messages,messageRole} from './conversation-schema';
import type {QueryPlan} from '@/server/contracts/pipeline';
export const runPlans=pgTable('run_plans',{
 runId:uuid('run_id').primaryKey(),conversationId:uuid('conversation_id').notNull(),messageId:uuid('message_id').notNull(),messageRole:messageRole('message_role').notNull().default('USER'),
 attemptVersion:integer('attempt_version').notNull(),version:varchar('version',{length:32}).notNull(),
 plan:jsonb('plan').$type<QueryPlan>().notNull(),contextIds:jsonb('context_ids').$type<string[]>().notNull(),
 originalHash:varchar('original_hash',{length:64}).notNull(),createdAt:timestamp('created_at',{withTimezone:true,precision:3}).notNull(),
},t=>[
 foreignKey({columns:[t.runId,t.conversationId],foreignColumns:[runs.id,runs.conversationId],name:'plan_owned_run_fk'}).onDelete('cascade'),
 foreignKey({columns:[t.messageId,t.conversationId,t.messageRole],foreignColumns:[messages.id,messages.conversationId,messages.role],name:'plan_owned_message_fk'}).onDelete('cascade'),
 check('plan_metadata_valid',sql`${t.attemptVersion}>0 AND ${t.messageRole}='USER' AND ${t.version} IN ('planner-v1','planner-v2','planner-v3','planner-v4','planner-v5') AND ${t.originalHash} ~ '^[a-f0-9]{64}$' AND jsonb_typeof(${t.plan})='object' AND coalesce(${t.plan}->>'action','') IN ('ANSWER','CLARIFY') AND jsonb_typeof(${t.contextIds})='array' AND jsonb_array_length(${t.contextIds})<=6`),
]);
