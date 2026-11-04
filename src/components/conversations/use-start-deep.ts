'use client';
import {useRef} from 'react';
import {useRouter} from 'next/navigation';
import {useModelAccess} from './model-access';
export function useStartDeep() {
 const router=useRouter(),{refresh}=useModelAccess();
 const intent=useRef<{question:string;requestId:string}|null>(null);
 return async(question:string)=>{
  if(!question.trim()||question.length>1000)throw new Error('Deep Research questions can contain up to 1,000 characters.');
  if(intent.current?.question!==question)intent.current={question,requestId:crypto.randomUUID()};
  const response=await fetch('/api/jobs',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({version:1,workflow:'deep-research-v2',locale:navigator.language,question,requestId:intent.current.requestId})});
  if(response.status===401){router.replace('/sign-in');throw new Error('Please sign in again.');}
  const body=await response.json();
  if(!response.ok)throw new Error('Could not start research. Check your Pro allowance and retry the same question.');
  if(typeof body.id!=='string'||!/^[a-f0-9-]{36}$/i.test(body.id))throw new Error('Could not confirm the saved job. Retry the same question.');
  refresh();router.push(`/jobs?job=${body.id}`);
 };
}
