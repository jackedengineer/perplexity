import {ProCheckoutLink} from '@/components/pro-checkout-link';
import {BillingConsole} from '@/components/jobs/billing-console';
export default async function Page({searchParams}:{searchParams:Promise<{signedOut?:string}>}){
 const signedIn=(await searchParams).signedOut!=='1';
 return <main style={{padding:24,maxWidth:900,margin:'auto'}}><h1>Pro upgrade verification</h1><ProCheckoutLink signedIn={signedIn}/>
 <BillingConsole initial={{mode:'LIVE',priceKey:'pro-live-monthly-inr-v1',jobLimit:7,purchasesEnabled:true,amountPaise:99900,checkouts:[],access:null}}/></main>;
}
