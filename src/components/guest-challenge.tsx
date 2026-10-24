'use client';
import Script from 'next/script';
import {useEffect,useRef} from 'react';
type Turnstile={render:(element:HTMLElement,options:{sitekey:string;action:string;size:string;callback:(token:string)=>void;'expired-callback':()=>void;'error-callback':()=>void})=>string;remove:(id:string)=>void};
const api=()=>(window as Window&{turnstile?:Turnstile}).turnstile;
export function GuestChallenge({siteKey,onToken}:{siteKey:string;onToken:(token:string)=>void}) {
 const element=useRef<HTMLDivElement>(null),widget=useRef<string|null>(null),callback=useRef(onToken);
 useEffect(()=>{callback.current=onToken;},[onToken]);
 function ready(){const turnstile=api();if(!turnstile||!element.current||widget.current!==null)return;
  widget.current=turnstile.render(element.current,{sitekey:siteKey,action:'guest_trial',size:'flexible',callback:token=>callback.current(token),'expired-callback':()=>callback.current(''),'error-callback':()=>callback.current('')});
 }
 useEffect(()=>()=>{if(widget.current!==null)api()?.remove(widget.current);widget.current=null;},[]);
 return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={ready} onError={()=>callback.current('')}/><div ref={element} aria-label="Guest verification"/></>;
}
