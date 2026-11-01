import {sql} from 'drizzle-orm';
import {boolean,check,index,integer,pgTable,timestamp,uniqueIndex,uuid,varchar} from 'drizzle-orm/pg-core';
import {appUsers} from './conversation-schema';
const instant=(name:string)=>timestamp(name,{withTimezone:true,precision:3});
export const billingCheckouts=pgTable('billing_checkouts',{
 id:uuid('id').primaryKey().defaultRandom(),userId:uuid('user_id').notNull().references(()=>appUsers.id),requestId:uuid('request_id').notNull(),
 planId:varchar('plan_id',{length:80}).notNull(),priceKey:varchar('price_key',{length:32}).notNull(),environment:varchar('environment',{length:8}).notNull(),
 subscriptionId:varchar('subscription_id',{length:80}).unique(),state:varchar('state',{length:16}).notNull(),providerState:varchar('provider_state',{length:32}),cancelAtCycleEnd:boolean('cancel_at_cycle_end').notNull().default(false),
 createdAt:instant('created_at').notNull().defaultNow(),updatedAt:instant('updated_at').notNull().defaultNow(),
},t=>[uniqueIndex('checkout_subscription_owner').on(t.subscriptionId,t.userId),uniqueIndex('checkout_owner_intent').on(t.userId,t.requestId),uniqueIndex('checkout_one_open_owner').on(t.userId).where(sql`${t.state} IN ('CREATING','READY','UNKNOWN')`),index('checkout_reconcile').on(t.state,t.updatedAt),
 check('checkout_test_plan_valid',sql`${t.environment}='TEST' AND ${t.priceKey}='pro-monthly-inr-v1' AND ${t.state} IN ('CREATING','READY','UNKNOWN','CANCELLED','COMPLETED')`)]);
export const billingInbox=pgTable('billing_inbox',{
 eventId:varchar('event_id',{length:100}).primaryKey(),bodyHash:varchar('body_hash',{length:64}).notNull(),kind:varchar('kind',{length:64}).notNull(),
 subscriptionId:varchar('subscription_id',{length:80}),paymentId:varchar('payment_id',{length:80}),state:varchar('state',{length:16}).notNull().default('PENDING'),
 attempts:integer('attempts').notNull().default(0),leaseToken:uuid('lease_token'),leaseUntil:instant('lease_until'),availableAt:instant('available_at').notNull().defaultNow(),createdAt:instant('created_at').notNull().defaultNow(),
},t=>[index('billing_inbox_due').on(t.state,t.availableAt),check('billing_inbox_valid',sql`${t.bodyHash} ~ '^[a-f0-9]{64}$' AND ${t.state} IN ('PENDING','PROCESSING','APPLIED','ATTENTION') AND ${t.attempts} BETWEEN 0 AND 10`)]);
// Permanent within the test billing ledger: a delayed charge event cannot undo a refund/dispute.
export const billingReversals=pgTable('billing_reversals',{
 paymentId:varchar('payment_id',{length:80}).primaryKey(),reason:varchar('reason',{length:64}).notNull(),createdAt:instant('created_at').notNull().defaultNow(),
});
