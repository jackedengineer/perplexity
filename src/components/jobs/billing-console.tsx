'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
import './jobs.css';
import {PRO_OFFER} from '@/lib/pro-offer';
type Status={mode:'TEST'|'LIVE';priceKey:string;jobLimit:number;purchasesEnabled:boolean;amountPaise:number;checkouts:{id:string;requestId:string;state:string;providerState:string|null;cancelAtCycleEnd:boolean;subscriptionId:string|null}[];access:{endsAt:string;remaining:number}|null};
type Confirmation={razorpay_payment_id:string;razorpay_subscription_id:string;razorpay_signature:string};
type CheckoutOptions={key:string;subscription_id:string;name:string;description:string;handler:(data:Confirmation)=>void;modal:{ondismiss:()=>void}};
declare global{interface Window{Razorpay?:new(options:CheckoutOptions)=>{open:()=>void;on:(event:string,handler:()=>void)=>void}}}
let sdk:Promise<void>|undefined;
function loadCheckout(){return sdk??=new Promise<void>((resolve,reject)=>{
 if(window.Razorpay){resolve();return;}const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.async=true;script.onload=()=>resolve();script.onerror=()=>{sdk=undefined;script.remove();reject(new Error('Could not load Razorpay. Please try again.'));};document.head.append(script);
});}
async function read(response:Response){const result=await response.json();if(!response.ok)throw new Error(result.error?.message??'Billing is temporarily unavailable.');return result;}
export function BillingConsole({initial}:{initial:Status}){
 const [status,setStatus]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),intent=useRef<string|null>(null);
 async function refresh(){try{setStatus(await read(await fetch('/api/billing',{cache:'no-store'})));setError('');}catch(e){setError(e instanceof Error?e.message:'Could not refresh billing.');}}
 async function checkout(existingId?:string){
  if(busy||!status.purchasesEnabled)return;setBusy(true);setError('');setNotice('');intent.current=existingId??intent.current??crypto.randomUUID();
  try{
   await loadCheckout();
   const data=await read(await fetch('/api/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:intent.current,priceKey:status.priceKey})}));
   if(!data.subscriptionId||!data.keyId||!window.Razorpay)throw new Error('This checkout is awaiting server verification. Refresh its status; do not start another subscription.');
   const modal=new window.Razorpay({key:data.keyId,subscription_id:data.subscriptionId,name:'perplexity',description:status.mode==='TEST'?'Pro ₹999/month — TEST MODE':'Pro ₹999 — one month, 7 Deep Research reports',modal:{ondismiss:()=>{setBusy(false);void refresh();}},handler:async confirmation=>{
    try{setStatus(await read(await fetch('/api/billing/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checkoutId:data.checkoutId,...confirmation})})));setNotice('Checkout verified. Access appears after a captured subscription invoice is confirmed.');intent.current=null;}
    catch(e){setError(e instanceof Error?e.message:'Verification pending. Refresh the saved subscription.');}finally{setBusy(false);}
   }});modal.on('payment.failed',()=>{setBusy(false);setError('The payment did not complete. No access was granted.');});modal.open();
  }catch(e){setError(e instanceof Error?e.message:'Could not open checkout.');setBusy(false);}
 }
 const checkoutSaved=(requestId:string)=>checkout(requestId);
 async function cancel(id:string){setBusy(true);setError('');try{
  setStatus(await read(await fetch(`/api/billing/${id}/cancel`,{method:'POST'})));setNotice('Renewal cancellation requested. Any verified paid-through period is retained.');
 }catch(e){setError(e instanceof Error?e.message:'Cancellation is not confirmed. Try again.');}finally{setBusy(false);}}
 const test=status.mode==='TEST';
 return <section className="jobs-page" aria-labelledby="billing-heading"><header><span className="jobs-eyebrow">RAZORPAY · {test?'TEST MODE':'BILLING'}</span><h1 id="billing-heading">Pro subscription</h1><p>{test?'The selected Pro price is ₹999/month. This sandbox uses test payments only.':'Manage your Pro month and verified paid-through access.'}</p></header>
  <section className="jobs-card"><div className="jobs-card-heading"><div><h2>₹999 <small>/ month</small></h2><p>Deep Research with saved progress and cited reports.</p></div><span className="jobs-badge">{test?'Not live':status.purchasesEnabled?'Live':'Purchases paused'}</span></div>
   <p className="jobs-note">Pro includes {PRO_OFFER.deepResearchRuns} completed Deep Research reports per paid month. Browser Tasks are not included. {test?'This sandbox retains its separate ten-job test allowance. No real purchase is available here.':'This limited pilot covers one monthly billing cycle and does not renew automatically. Unused reports expire at the paid-through date without rollover. A maximum of 14 started attempts applies, including failed or stopped work; stopping before execution is excluded.'}</p>
   {!test&&<p className="jobs-note"><Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/refunds">Refund policy</Link>. No voluntary refunds for unused allowance; mandatory legal remedies remain available.</p>}
   {!status.purchasesEnabled&&<p className="jobs-note" role="status">New purchases are paused or the pilot seat is reserved. Existing subscribers can still refresh billing and manage their paid-through access.</p>}
   <div className="jobs-actions"><button className="jobs-primary" disabled={busy||!!status.access||!status.purchasesEnabled} onClick={()=>checkout()}>{status.access?(test?'Test access active':'Pro access active'):busy?'Connecting…':!status.purchasesEnabled?'Purchases paused':test?'Open Razorpay test checkout':'Start one month for ₹999'}</button><Link href="/jobs">Research workspace ↗</Link></div>
   {status.access&&<p className="jobs-receipt">{status.access.remaining} {test?'checks':'reports'} available · paid through {new Date(status.access.endsAt).toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'})+' UTC'}</p>}
  </section>
  {status.checkouts.length>0&&<section className="jobs-card"><h2>Saved subscription</h2>{status.checkouts.map(checkout=><div className="billing-subscription" key={checkout.id}><p>{checkout.providerState??checkout.state} {checkout.cancelAtCycleEnd?'· renewal cancellation requested':''}</p><p className="jobs-note">{checkout.state==='UNKNOWN'||checkout.state==='CREATING'?'Verification is pending. We will not create a second subscription.':'Only captured, verified invoices grant access.'}</p>{checkout.subscriptionId&&!checkout.cancelAtCycleEnd&&!['CANCELLED','COMPLETED'].includes(checkout.state)&&<div className="jobs-actions">{status.purchasesEnabled&&!status.access&&checkout.state==='READY'&&<button className="jobs-primary" disabled={busy} onClick={()=>checkoutSaved(checkout.requestId)}>{test?'Resume test checkout':'Resume checkout'}</button>}<button className="jobs-stop" disabled={busy} onClick={()=>cancel(checkout.id)}>Cancel renewal</button></div>}</div>)}<div className="jobs-actions"><button className="jobs-stop" disabled={busy} onClick={refresh}>Refresh billing status</button></div></section>}
  {notice&&<p className="jobs-note" role="status">{notice}</p>}{error&&<div className="jobs-error" role="alert"><p>{error}</p></div>}
 </section>;
}
