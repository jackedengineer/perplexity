import {sql} from 'drizzle-orm';
import {pgTable,uuid,varchar,integer,timestamp,primaryKey,foreignKey,check,pgPolicy} from 'drizzle-orm/pg-core';
import {conversations,messages,messageRole} from './conversation-schema';
import {outputReviews} from './completion-schema';
import {runs} from './run-schema';
const reviewed=sql`EXISTS(SELECT 1 FROM output_safety_reviews o JOIN runs r ON r.id=o.run_id WHERE o.run_id=message_feedback.run_id AND o.message_id=message_feedback.message_id AND o.conversation_id=message_feedback.conversation_id AND o.decision='ALLOW' AND r.status IN ('COMPLETED','NEEDS_CLARIFICATION'))`;
export const messageFeedback=pgTable('message_feedback',{
 userId:uuid('user_id').notNull(),conversationId:uuid('conversation_id').notNull(),messageId:uuid('message_id').notNull(),runId:uuid('run_id').notNull(),messageRole:messageRole('message_role').notNull().default('ASSISTANT'),
 rating:varchar('rating',{length:16}).notNull(),reason:varchar('reason',{length:32}),version:integer('version').notNull().default(1),
 createdAt:timestamp('created_at',{withTimezone:true,precision:3}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true,precision:3}).notNull().defaultNow(),
},t=>[
 primaryKey({columns:[t.userId,t.messageId]}),
 foreignKey({columns:[t.conversationId,t.userId],foreignColumns:[conversations.id,conversations.userId],name:'feedback_owned_conversation_fk'}).onDelete('cascade'),
 foreignKey({columns:[t.messageId,t.conversationId,t.messageRole],foreignColumns:[messages.id,messages.conversationId,messages.role],name:'feedback_owned_assistant_fk'}).onDelete('cascade'),
 foreignKey({columns:[t.runId,t.messageId],foreignColumns:[outputReviews.runId,outputReviews.messageId],name:'feedback_approved_message_fk'}).onDelete('cascade'),
 foreignKey({columns:[t.runId,t.conversationId],foreignColumns:[runs.id,runs.conversationId],name:'feedback_same_run_fk'}).onDelete('cascade'),
 check('feedback_value_valid',sql`${t.messageRole}='ASSISTANT' AND ${t.version}>0 AND ${t.rating} IN ('HELPFUL','NOT_HELPFUL') AND (${t.reason} IS NULL OR ${t.rating}='NOT_HELPFUL' AND ${t.reason} IN ('MISSING_EVIDENCE','WRONG_INTERPRETATION','FALSE_REFUSAL')) AND ${t.updatedAt}>=${t.createdAt}`),
 pgPolicy('feedback_runtime_read',{for:'select',using:sql`true`}),pgPolicy('feedback_reviewed_insert',{for:'insert',withCheck:reviewed}),pgPolicy('feedback_reviewed_update',{for:'update',using:reviewed,withCheck:reviewed}),
]).enableRLS();
