'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {authClient} from '@/lib/auth-client';
export function GuestSignIn() {
 const [pending,setPending]=useState(false),[error,setError]=useState(''),router=useRouter();
 async function start(){if(pending)return;setPending(true);setError('');try{
  const result=await authClient.signIn.anonymous();if(result.error)throw new Error();router.replace('/workspace');router.refresh();
 }catch{setError('Guest access is unavailable or this browser has used its trial. Sign in with Google to continue.');setPending(false);}}
 return <div><button className="button" disabled={pending} onClick={()=>void start()}>{pending?'Starting your trial…':'Try 3 answers free'}</button>
 <p className="privacy-note">No payment details. Keep this browser session to access your trial. Sign in to save your history before it expires in 30 days.</p>{error&&<p role="alert" className="inline-error">{error}</p>}</div>;
}
