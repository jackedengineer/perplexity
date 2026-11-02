import {PRO_OFFER} from '@/lib/pro-offer';
import {JobError} from '@/server/jobs/contracts';

export type PaymentMode = 'TEST' | 'LIVE';
export const testOffer = {priceKey:'pro-monthly-inr-v1', amountPaise:99_900, currency:'INR', jobLimit:10} as const;
export const liveOffer = {priceKey:'pro-live-monthly-inr-v1', amountPaise:PRO_OFFER.amountPaise, currency:PRO_OFFER.currency, jobLimit:PRO_OFFER.deepResearchRuns} as const;

// Mode is selected by server credentials, never by a request body or provider notes.
export function paymentMode(keyId:string):PaymentMode {
 if(/^rzp_test_[A-Za-z0-9]+$/u.test(keyId))return 'TEST';
 if(/^rzp_live_[A-Za-z0-9]+$/u.test(keyId))return 'LIVE';
 throw new JobError('DISABLED');
}
export function offerFor(mode:PaymentMode){return mode==='LIVE'?liveOffer:testOffer;}
