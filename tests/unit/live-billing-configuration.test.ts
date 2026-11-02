import {expect,it,vi} from 'vitest';
import {paymentConfiguration} from '@/server/payments/config';
import {createRazorpay} from '@/server/payments/razorpay';
import {liveOffer,offerFor,paymentMode} from '@/server/payments/offer';

const database='postgresql://perplex_web:synthetic@ep-small-bread-b3we4v54-pooler.c-4.ap-southeast-1.aws.neon.tech/perplex?sslmode=verify-full';
const live={ENABLE_RAZORPAY_LIVE_BILLING:'true',VERCEL_ENV:'production',BETTER_AUTH_URL:'https://perplexity-gold-alpha.vercel.app',DATABASE_URL:database,
 RAZORPAY_KEY_ID:'rzp_live_synthetic',RAZORPAY_KEY_SECRET:'s'.repeat(32),RAZORPAY_PRO_PLAN_ID:'plan_synthetic',RAZORPAY_WEBHOOK_SECRET:'w'.repeat(32)};
it('requires explicit production billing, canonical origin, live key and isolated runtime database',()=>{
 expect(paymentConfiguration(live)).toMatchObject({mode:'LIVE',planId:'plan_synthetic',purchasesEnabled:false});
 for(const patch of [{VERCEL_ENV:'preview'},{ENABLE_RAZORPAY_LIVE_BILLING:'false'},{ENABLE_RAZORPAY_TEST_CHECKOUT:'true'},
  {RAZORPAY_KEY_ID:'rzp_test_synthetic'},{BETTER_AUTH_URL:'https://attacker.test'},
  {DATABASE_URL:database.replace('ep-small-bread','ep-other')},{DATABASE_URL:database.replace('perplex_web','perplex_owner')},
  {DATABASE_URL:database.replace('verify-full','require')},{JOB_DATABASE_URL:database},
  {RAZORPAY_WEBHOOK_SECRET:''}])expect(()=>paymentConfiguration({...live,...patch})).toThrow();
});
it('keeps historical test allowance separate from the immutable seven-run live offer',()=>{
 expect(offerFor(paymentMode('rzp_test_fixture')).jobLimit).toBe(10);
 expect(offerFor(paymentMode('rzp_live_fixture'))).toEqual(liveOffer);
 expect(liveOffer).toMatchObject({amountPaise:99900,currency:'INR',jobLimit:7});
 expect(()=>paymentMode('rzp_live_fixture/unsafe')).toThrow();
});
it('requires explicit live adapter permission and writes server-selected offer notes',async()=>{
 expect(()=>createRazorpay({keyId:'rzp_live_fixture',keySecret:'synthetic'})).toThrow();
 const id=crypto.randomUUID(),fetcher=vi.fn(async()=>Response.json({id:'sub_fixture',plan_id:'plan_fixture',status:'created',quantity:1,notes:{checkoutId:id,priceKey:liveOffer.priceKey}}));
 const api=createRazorpay({keyId:'rzp_live_fixture',keySecret:'synthetic',allowLive:true},fetcher);
 await api.create(id,'plan_fixture');
 const [url,request]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
 expect(url).toBe('https://api.razorpay.com/v1/subscriptions');
 expect(JSON.parse(request.body as string)).toMatchObject({plan_id:'plan_fixture',quantity:1,notes:{checkoutId:id,priceKey:liveOffer.priceKey}});
 expect(fetcher).toHaveBeenCalledTimes(1);
});
