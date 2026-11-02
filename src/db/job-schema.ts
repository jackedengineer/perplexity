import {sql} from 'drizzle-orm';
import {bigint,check,foreignKey,index,integer,jsonb,text,pgTable,primaryKey,timestamp,uniqueIndex,uuid,varchar} from 'drizzle-orm/pg-core';
import {appUsers} from './conversation-schema';
import {operatorUsageBuckets,budgetKind} from './run-schema';
import {billingCheckouts} from './billing-schema';
const instant=(name:string)=>timestamp(name,{withTimezone:true,precision:3});
const money=(name:string)=>bigint(name,{mode:'bigint'});
// Mode is part of the originating paid-checkout identity; TEST grants stay TEST.
export const jobPeriods=pgTable('job_periods',{
 id:uuid('id').primaryKey().defaultRandom(),userId:uuid('user_id').notNull().references(()=>appUsers.id),
 environment:varchar('environment',{length:8}).notNull(),paymentId:varchar('payment_id',{length:80}).notNull().unique(),invoiceId:varchar('invoice_id',{length:80}).notNull().unique(),
 subscriptionId:varchar('subscription_id',{length:80}).notNull(),startsAt:instant('starts_at').notNull(),endsAt:instant('ends_at').notNull(),
 state:varchar('state',{length:16}).notNull().default('ACTIVE'),jobLimit:integer('job_limit').notNull(),reservedJobs:integer('reserved_jobs').notNull().default(0),spentJobs:integer('spent_jobs').notNull().default(0),
},t=>[uniqueIndex('job_period_id_owner').on(t.id,t.userId),foreignKey({columns:[t.subscriptionId,t.userId,t.environment],foreignColumns:[billingCheckouts.subscriptionId,billingCheckouts.userId,billingCheckouts.environment],name:'job_period_paid_checkout_owner'}),index('job_period_owner_window').on(t.userId,t.environment,t.endsAt),check('job_period_valid',sql`((${t.environment}='TEST' AND ${t.jobLimit} BETWEEN 1 AND 100) OR (${t.environment}='LIVE' AND ${t.jobLimit}=7)) AND ${t.endsAt}>${t.startsAt} AND ${t.state} IN ('ACTIVE','REVOKED') AND ${t.reservedJobs}>=0 AND ${t.spentJobs}>=0 AND ${t.reservedJobs}+${t.spentJobs}<=${t.jobLimit}`)]);
export const durableJobs=pgTable('durable_jobs',{
 id:uuid('id').primaryKey().defaultRandom(),userId:uuid('user_id').notNull().references(()=>appUsers.id),
 requestId:uuid('request_id').notNull(),fingerprint:varchar('fingerprint',{length:64}).notNull(),workflow:varchar('workflow',{length:64}).notNull(),
 periodId:uuid('period_id').notNull().references(()=>jobPeriods.id),state:varchar('state',{length:16}).notNull().default('QUEUED'),
 generation:integer('generation').notNull().default(0),leaseUntil:instant('lease_until'),nextEvent:integer('next_event').notNull().default(1),
 deadlineAt:instant('deadline_at').notNull(),createdAt:instant('created_at').notNull().defaultNow(),updatedAt:instant('updated_at').notNull().defaultNow(),deletedAt:instant('deleted_at'),
},t=>[foreignKey({columns:[t.periodId,t.userId],foreignColumns:[jobPeriods.id,jobPeriods.userId],name:'job_paid_period_owner'}),uniqueIndex('job_owner_intent').on(t.userId,t.requestId),uniqueIndex('job_one_active_owner').on(t.userId).where(sql`${t.state} IN ('QUEUED','RUNNING')`),
 index('job_recovery_scan').on(t.state,t.leaseUntil,t.deadlineAt),check('job_snapshot_valid',sql`${t.workflow} IN ('execution-check-v1','deep-research-v1') AND ${t.fingerprint} ~ '^[a-f0-9]{64}$' AND ${t.generation}>=0 AND ${t.nextEvent}>0 AND ${t.deadlineAt}>${t.createdAt} AND ${t.state} IN ('QUEUED','RUNNING','COMPLETED','CANCELLED','FAILED','EXPIRED')`)]);
export const jobReservations=pgTable('job_reservations',{
 jobId:uuid('job_id').primaryKey().references(()=>durableJobs.id),budgetKey:varchar('budget_key',{length:64}).notNull(),periodKind:budgetKind('period_kind').notNull().default('PERIOD'),dayKind:budgetKind('day_kind').notNull().default('DAY'),operatorPeriodId:uuid('operator_period_id').notNull().references(()=>operatorUsageBuckets.id),operatorDayId:uuid('operator_day_id').notNull().references(()=>operatorUsageBuckets.id),
 reservedMicroUsd:money('reserved_micro_usd').notNull(),spentMicroUsd:money('spent_micro_usd').notNull().default(sql`0`),heldMicroUsd:money('held_micro_usd').notNull().default(sql`0`),settledAt:instant('settled_at'),
},t=>[foreignKey({columns:[t.operatorPeriodId,t.budgetKey,t.periodKind],foreignColumns:[operatorUsageBuckets.id,operatorUsageBuckets.budgetKey,operatorUsageBuckets.kind],name:'job_operator_period_snapshot'}),foreignKey({columns:[t.operatorDayId,t.budgetKey,t.dayKind],foreignColumns:[operatorUsageBuckets.id,operatorUsageBuckets.budgetKey,operatorUsageBuckets.kind],name:'job_operator_day_snapshot'}),check('job_reservation_kinds',sql`${t.periodKind}='PERIOD' AND ${t.dayKind}='DAY'`),check('job_reservation_valid',sql`${t.operatorPeriodId}<>${t.operatorDayId} AND ${t.reservedMicroUsd}>=0 AND ${t.spentMicroUsd}>=0 AND ${t.heldMicroUsd}>=0 AND ${t.spentMicroUsd}+${t.heldMicroUsd}<=${t.reservedMicroUsd}`)]);
export const jobSteps=pgTable('job_steps',{
 jobId:uuid('job_id').notNull().references(()=>durableJobs.id),key:varchar('key',{length:64}).notNull(),kind:varchar('kind',{length:16}).notNull(),
 capMicroUsd:money('cap_micro_usd').notNull(),state:varchar('state',{length:16}).notNull().default('PENDING'),generation:integer('generation'),costMicroUsd:money('cost_micro_usd'),
 startedAt:instant('started_at'),finishedAt:instant('finished_at'),
},t=>[primaryKey({columns:[t.jobId,t.key]}),check('job_step_valid',sql`${t.kind} IN ('SYSTEM','MODEL','SEARCH','BROWSER') AND ${t.capMicroUsd}>=0 AND (${t.kind}<>'SYSTEM' OR ${t.capMicroUsd}=0) AND ${t.state} IN ('PENDING','STARTED','SUCCEEDED','UNKNOWN','SKIPPED') AND (${t.costMicroUsd} IS NULL OR ${t.costMicroUsd} BETWEEN 0 AND ${t.capMicroUsd}) AND (${t.state}<>'SUCCEEDED' OR ${t.costMicroUsd} IS NOT NULL)`)]);
export const jobEvents=pgTable('job_events',{
 jobId:uuid('job_id').notNull().references(()=>durableJobs.id),sequence:integer('sequence').notNull(),code:varchar('code',{length:32}).notNull(),step:varchar('step',{length:64}),createdAt:instant('created_at').notNull().defaultNow(),
},t=>[primaryKey({columns:[t.jobId,t.sequence]}),check('job_event_valid',sql`${t.sequence}>0 AND ${t.code} IN ('QUEUED','RUNNING','STEP_STARTED','STEP_COMPLETED','RECOVERED','CANCELLED','COMPLETED','FAILED','EXPIRED','COST_UNKNOWN')`)]);
export const jobOutbox=pgTable('job_outbox',{
 jobId:uuid('job_id').primaryKey().references(()=>durableJobs.id),revision:integer('revision').notNull().default(1),state:varchar('state',{length:16}).notNull().default('PENDING'),
 attempts:integer('attempts').notNull().default(0),leaseToken:uuid('lease_token'),leaseUntil:instant('lease_until'),availableAt:instant('available_at').notNull().defaultNow(),
},t=>[index('job_outbox_dispatch').on(t.state,t.availableAt),check('job_outbox_valid',sql`${t.revision}>0 AND ${t.attempts} BETWEEN 0 AND 20 AND ${t.state} IN ('PENDING','DISPATCHING','DELIVERED')`)]);

// Immutable private input and per-step output. Neither table is a public read model.
export const jobResearchInputs=pgTable('job_research_inputs',{
 jobId:uuid('job_id').primaryKey().references(()=>durableJobs.id),
 snapshot:jsonb('snapshot').$type<import('@/server/deep-research/contracts').ResearchSnapshot>().notNull(),
},t=>[check('research_input_bound',sql`octet_length(${t.snapshot}::text)<=12000`)]);
export const jobCheckpoints=pgTable('job_checkpoints',{
 jobId:uuid('job_id').notNull(),step:varchar('step',{length:64}).notNull(),value:jsonb('value').$type<unknown>().notNull(),
 hash:text('hash').notNull(),createdAt:instant('created_at').notNull().defaultNow(),
},t=>[primaryKey({columns:[t.jobId,t.step]}),foreignKey({columns:[t.jobId,t.step],foreignColumns:[jobSteps.jobId,jobSteps.key],name:'checkpoint_step'}),
 check('checkpoint_bound',sql`octet_length(${t.value}::text)<=200000 AND ${t.hash} ~ '^[a-f0-9]{64}$'`)]);
