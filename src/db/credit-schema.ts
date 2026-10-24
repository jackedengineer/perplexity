import {sql} from 'drizzle-orm';
import {pgTable,uuid,varchar,integer,timestamp,uniqueIndex,check,text} from 'drizzle-orm/pg-core';
import {appUsers} from './conversation-schema';
import {usageBuckets,runs} from './run-schema';
const instant=(name:string)=>timestamp(name,{withTimezone:true,precision:3});
export const creditGrants=pgTable('credit_grants',{
 id:uuid('id').primaryKey().defaultRandom(),userId:uuid('user_id').notNull().references(()=>appUsers.id,{onDelete:'cascade'}),
 bucketId:uuid('bucket_id').notNull().references(()=>usageBuckets.id,{onDelete:'cascade'}),
 kind:varchar('kind',{length:16}).notNull(),startsAt:instant('starts_at').notNull(),endsAt:instant('ends_at').notNull(),credits:integer('credits').notNull(),createdAt:instant('created_at').notNull().defaultNow(),
},t=>[uniqueIndex('credit_grant_once').on(t.userId,t.kind,t.startsAt),uniqueIndex('credit_grant_bucket_once').on(t.bucketId),check('credit_grant_valid',sql`${t.endsAt}>${t.startsAt} AND (${t.kind}='GUEST' AND ${t.credits}=6 OR ${t.kind}='FREE' AND ${t.credits}=40)`)]);
export const creditLedger=pgTable('credit_ledger',{
 id:uuid('id').primaryKey().defaultRandom(),runId:uuid('run_id').notNull().references(()=>runs.id,{onDelete:'cascade'}),
 kind:varchar('kind',{length:16}).notNull(),credits:integer('credits').notNull(),createdAt:instant('created_at').notNull().defaultNow(),
},t=>[uniqueIndex('credit_ledger_run_kind_once').on(t.runId,t.kind),check('credit_ledger_entry_valid',sql`${t.kind} IN ('RESERVE','CHARGE','RELEASE') AND ${t.credits} BETWEEN 0 AND 15`)]);
export const guestLinks=pgTable('guest_links',{
 guestId:uuid('guest_id').primaryKey().references(()=>appUsers.id,{onDelete:'cascade'}),userId:uuid('user_id').notNull().references(()=>appUsers.id,{onDelete:'cascade'}),
 credits:integer('credits').notNull(),dayCredits:integer('day_credits').notNull(),linkedAt:instant('linked_at').notNull().defaultNow(),
},t=>[check('guest_link_valid',sql`${t.guestId}<>${t.userId} AND ${t.credits} BETWEEN 0 AND 6 AND ${t.dayCredits} BETWEEN 0 AND ${t.credits}`)]);
export const guestTrials=pgTable('guest_trials',{
 handleHash:varchar('handle_hash',{length:64}).primaryKey(),authSubject:text('auth_subject').notNull().unique(),createdAt:instant('created_at').notNull().defaultNow(),expiresAt:instant('expires_at').notNull(),
},t=>[check('guest_trial_valid',sql`${t.handleHash} ~ '^[a-f0-9]{64}$' AND ${t.expiresAt}>${t.createdAt}`)]);
