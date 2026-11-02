import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {JobError} from '@/server/jobs/contracts';
import {liveOffer,offerFor,paymentMode,testOffer} from './offer';
export const proPlan={priceKey:'pro-monthly-inr-v1',amountPaise:99900,currency:'INR',sandboxChecks:10} as const;
const reference=(prefix:string)=>z.string().regex(new RegExp('^'+prefix+'_[A-Za-z0-9]{1,64}$'));
export const subscriptionId=reference('sub'),paymentId=reference('pay'),invoiceId=reference('inv'),planId=reference('plan');
const priceKey=z.enum([testOffer.priceKey,liveOffer.priceKey]);
export const checkoutInput=z.strictObject({requestId:z.uuid(),priceKey});
export const confirmationInput=z.strictObject({checkoutId:z.uuid(),razorpay_payment_id:paymentId,razorpay_subscription_id:subscriptionId,razorpay_signature:z.string().regex(/^[a-f0-9]{64}$/u)});
export const subscriptionSchema=z.object({id:subscriptionId,plan_id:planId,status:z.enum(['created','authenticated','active','pending','halted','cancelled','completed','expired']),quantity:z.literal(1),notes:z.object({checkoutId:z.uuid(),priceKey})});
export const invoiceSchema=z.object({id:invoiceId,payment_id:paymentId,status:z.literal('paid'),amount:z.literal(proPlan.amountPaise),amount_paid:z.literal(proPlan.amountPaise),currency:z.literal('INR'),billing_start:z.int().positive(),billing_end:z.int().positive()});
export const paymentSchema=z.object({id:paymentId,invoice_id:invoiceId,status:z.literal('captured'),amount:z.literal(proPlan.amountPaise),currency:z.literal('INR'),amount_refunded:z.literal(0)});
// Polling uses the same linked invoice/payment identity as grants. A refund is
// authoritative only after checking the currency, original amount and references.
const refundedPaymentSchema=paymentSchema.extend({status:z.enum(['captured','refunded']),amount_refunded:z.int().min(0).max(proPlan.amountPaise)});
export function verifiedRefund(rawInvoice:unknown,rawPayment:unknown){
 const invoice=invoiceSchema.parse(rawInvoice),parsed=refundedPaymentSchema.safeParse(rawPayment);
 if(!parsed.success)return null;const payment=parsed.data;
 if(payment.id!==invoice.payment_id||payment.invoice_id!==invoice.id)return null;
 return payment.amount_refunded>0||payment.status==='refunded'?{paymentId:payment.id,invoiceId:invoice.id}:null;
}
export function verifySignature(body:Uint8Array,signature:string,secret:string){
 if(!/^[a-f0-9]{64}$/u.test(signature)||secret.length<16)return false;
 return timingSafeEqual(createHmac('sha256',secret).update(body).digest(),Buffer.from(signature,'hex'));
}
export function verifyCycle(rawInvoice:unknown,rawPayment:unknown){
 const invoice=invoiceSchema.parse(rawInvoice),payment=paymentSchema.parse(rawPayment);
 if(invoice.payment_id!==payment.id||payment.invoice_id!==invoice.id||invoice.billing_end<=invoice.billing_start||invoice.billing_end-invoice.billing_start>32*86400)throw new JobError('INVALID_INPUT');
 return {paymentId:payment.id,invoiceId:invoice.id,startsAt:new Date(invoice.billing_start*1000),endsAt:new Date(invoice.billing_end*1000)};
}
const supported=['subscription.charged','subscription.cancelled','subscription.halted','subscription.completed','subscription.authenticated','subscription.activated','payment.refunded','refund.processed','payment.dispute.created'] as const;
export function normalizeWebhook(raw:unknown){
 const envelope=z.object({event:z.enum(supported),payload:z.object({subscription:z.object({entity:z.object({id:subscriptionId})}).optional(),payment:z.object({entity:z.object({id:paymentId})}).optional(),refund:z.object({entity:z.object({payment_id:paymentId})}).optional(),dispute:z.object({entity:z.object({payment_id:paymentId})}).optional()})}).parse(raw);
 const payload=envelope.payload,payment=payload.payment?.entity.id??payload.refund?.entity.payment_id??payload.dispute?.entity.payment_id;
 if(envelope.event==='subscription.charged'&&(!payment||!payload.subscription))throw new JobError('INVALID_INPUT');
 if((envelope.event.startsWith('payment.')||envelope.event==='refund.processed')&&!payment)throw new JobError('INVALID_INPUT');
 return {kind:envelope.event,subscriptionId:payload.subscription?.entity.id??null,paymentId:payment??null};
}
export type RazorpayApi=ReturnType<typeof createRazorpay>;
export function createRazorpay(config:{keyId:string;keySecret:string;allowLive?:boolean},fetcher:typeof fetch=fetch){
 const mode=paymentMode(config.keyId),offer=offerFor(mode);
 if(!config.keySecret||mode==='LIVE'&&config.allowLive!==true)throw new JobError('DISABLED');
 async function request(path:string,body?:unknown){
  const response=await fetcher('https://api.razorpay.com/v1/'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Basic '+Buffer.from(config.keyId+':'+config.keySecret).toString('base64'),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000),redirect:'manual',cache:'no-store'});
  if(!response.ok){await response.body?.cancel();throw new JobError('UNAVAILABLE');}
  const reader=response.body?.getReader();if(!reader)throw new JobError('UNAVAILABLE');const chunks:Uint8Array[]=[];let total=0;
  try{for(;;){const next=await reader.read();if(next.done)break;total+=next.value.byteLength;if(total>512000)throw new JobError('UNAVAILABLE');chunks.push(next.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 }
 const ref=(value:string,schema:z.ZodType<string>)=>schema.parse(value);
 return {
  keyId:config.keyId,
  plan:async(id:string)=>{const result=await request('plans/'+ref(id,planId));return z.object({id:planId,period:z.literal('monthly'),interval:z.literal(1),item:z.object({amount:z.literal(99900),currency:z.literal('INR')})}).parse(result);},
  create:async(checkoutId:string,id:string)=>subscriptionSchema.parse(await request('subscriptions',{plan_id:ref(id,planId),total_count:mode==='LIVE'?1:12,quantity:1,customer_notify:0,expire_by:Math.floor(Date.now()/1000)+3600,notes:{checkoutId:z.uuid().parse(checkoutId),priceKey:offer.priceKey}})),
  subscription:async(id:string)=>subscriptionSchema.parse(await request('subscriptions/'+ref(id,subscriptionId))),
  subscriptions:async()=>z.object({items:z.array(z.unknown()).max(100)}).parse(await request('subscriptions?count=100')).items.flatMap(item=>{const parsed=subscriptionSchema.safeParse(item);return parsed.success?[parsed.data]:[];}),
  invoices:async(id:string)=>z.object({items:z.array(z.unknown()).max(100)}).parse(await request('invoices?subscription_id='+ref(id,subscriptionId)+'&count=100')).items,
  payment:async(id:string)=>request('payments/'+ref(id,paymentId)),
  cancel:async(id:string)=>subscriptionSchema.parse(await request('subscriptions/'+ref(id,subscriptionId)+'/cancel',{cancel_at_cycle_end:1})),
 };
}
