import {sql} from 'drizzle-orm';
import {check,integer,pgTable,primaryKey,timestamp,varchar} from 'drizzle-orm/pg-core';
import {attemptKind} from './run-schema';
export const requestRateBuckets=pgTable('request_rate_buckets',{
 bucketKey:varchar('bucket_key',{length:69}).notNull(),kind:attemptKind('kind').notNull(),
 startsAt:timestamp('starts_at',{withTimezone:true,precision:3}).notNull(),
 endsAt:timestamp('ends_at',{withTimezone:true,precision:3}).notNull(),attempts:integer('attempts').notNull(),
},t=>[
 primaryKey({columns:[t.bucketKey,t.kind,t.startsAt]}),
 check('request_rate_key_valid',sql`${t.bucketKey} ~ '^(user|anon):[a-f0-9]{64}$'`),
 check('request_rate_count_valid',sql`${t.attempts} BETWEEN 1 AND 10000`),
 check('request_rate_window_valid',sql`(${t.kind}='MINUTE' AND ${t.endsAt}=${t.startsAt}+interval '1 minute') OR (${t.kind}='DAY' AND ${t.endsAt}=${t.startsAt}+interval '1 day')`),
]);
