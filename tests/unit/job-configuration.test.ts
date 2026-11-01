import {it,expect} from 'vitest';
import {sandboxDatabaseUrl} from '@/server/jobs/connection';
import {paymentConfiguration} from '@/server/payments/config';
const database='postgresql://perplex_web:synthetic@ep-sweet-night-az8bacv2-pooler.c-3.ap-southeast-1.aws.neon.tech/perplex?sslmode=verify-full';
it('keeps the durable sandbox off by default and rejects production or mismatched database hosts',()=>{
 const env={ENABLE_DURABLE_JOB_SANDBOX:'true',DATABASE_URL:database};expect(sandboxDatabaseUrl(env)).toBe(database);
 for(const extra of [{ENABLE_DURABLE_JOB_SANDBOX:'false'},{VERCEL_ENV:'production'},{DATABASE_URL:database.replace('ep-sweet-night-az8bacv2','production')},{DATABASE_URL:database.replace('verify-full','require')},{DATABASE_URL:database.replace('postgresql:','https:')}])expect(()=>sandboxDatabaseUrl({...env,...extra})).toThrow();
});
it('rejects live keys and production even when checkout flags are set',()=>{
 const env={ENABLE_RAZORPAY_TEST_CHECKOUT:'true',RAZORPAY_KEY_ID:'rzp_test_synthetic',RAZORPAY_KEY_SECRET:'s'.repeat(32),RAZORPAY_PRO_PLAN_ID:'plan_synthetic',RAZORPAY_WEBHOOK_SECRET:'w'.repeat(32)};
 expect(paymentConfiguration(env).planId).toBe('plan_synthetic');
 for(const extra of [{VERCEL_ENV:'production'},{RAZORPAY_KEY_ID:'rzp_live_synthetic'},{ENABLE_RAZORPAY_TEST_CHECKOUT:'false'},{RAZORPAY_WEBHOOK_SECRET:''},{RAZORPAY_PRO_PLAN_ID:'plan/unsafe'}])expect(()=>paymentConfiguration({...env,...extra})).toThrow();
});
