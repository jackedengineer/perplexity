import {pgTable,text,timestamp} from 'drizzle-orm/pg-core';
// Aggregate maintenance status only: no questions, answers or credentials.
export const maintenanceStatus=pgTable('maintenance_status',{
 name:text('name').primaryKey(),
 startedAt:timestamp('started_at',{withTimezone:true}).notNull(),
 completedAt:timestamp('completed_at',{withTimezone:true}),
 outcome:text('outcome').notNull(),
});
