import {expect,it} from 'vitest';
import {createHmac} from 'node:crypto';
import {verifySignature,normalizeWebhook,verifyCycle,proPlan,createRazorpay} from '@/server/payments/razorpay';
const now=Math.floor(Date.now()/1000),invoice={id:'inv_test',payment_id:'pay_test',status:'paid',amount:99900,amount_paid:99900,currency:'INR',billing_start:now-60,billing_end:now+2592000};
const payment={id:'pay_test',invoice_id:'inv_test',status:'captured',amount:99900,currency:'INR',amount_refunded:0};
it('verifies exact raw bytes and rejects malformed, altered and forged signatures',()=>{
 const raw=Buffer.from('{ "event": "subscription.charged" }'),secret='test-signature-secret'.repeat(2),signature=createHmac('sha256',secret).update(raw).digest('hex');
 expect(verifySignature(raw,signature,secret)).toBe(true);expect(verifySignature(Buffer.from('{}'),signature,secret)).toBe(false);
 expect(verifySignature(raw,'bad',secret)).toBe(false);
});
it('pins complete paid invoices and captured payments without using mandate activation or current subscription dates',()=>{
 expect(verifyCycle(invoice,payment)).toMatchObject({paymentId:'pay_test',invoiceId:'inv_test'});
 for(const change of [{status:'issued'},{amount:1},{currency:'USD'},{billing_end:now-100},{payment_id:'pay_other'},{billing_end:now+4000000}])expect(()=>verifyCycle({...invoice,...change},payment)).toThrow();
 for(const change of [{status:'authorized'},{amount_refunded:1},{invoice_id:'inv_other'},{currency:'USD'},{amount:1}])expect(()=>verifyCycle(invoice,{...payment,...change})).toThrow();
});
it('normalizes only billing references and discards customer data',()=>{
 const event=normalizeWebhook({event:'subscription.charged',payload:{subscription:{entity:{id:'sub_test',customer_email:'private@example.test'}},payment:{entity:{id:'pay_test',email:'private@example.test'}}}});
 expect(event).toEqual({kind:'subscription.charged',subscriptionId:'sub_test',paymentId:'pay_test'});
 expect(proPlan.amountPaise).toBe(99900);expect(proPlan.currency).toBe('INR');
});
it('refuses live credentials and sends no implicit retries or arbitrary provider URLs',async()=>{
 expect(()=>createRazorpay({keyId:'rzp_live_test',keySecret:'secret'})).toThrow();
 let count=0;const api=createRazorpay({keyId:'rzp_test_safe',keySecret:'secret'},async()=>{count++;return new Response('{}',{status:500});});
 await expect(api.subscription('sub_test')).rejects.toThrow();expect(count).toBe(1);
 await expect(api.subscription('https://attacker.test')).rejects.toThrow();expect(count).toBe(1);
});
