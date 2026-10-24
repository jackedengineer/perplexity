'use client';
import {GuestChallenge} from './guest-challenge';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {authClient} from '@/lib/auth-client';
export function GuestSignIn({siteKey}:{siteKey?:string}) {
 const [token,setToken]=useState(''),[challengeVersion,setChallengeVersion]=useState(0);
 const [pending,setPending]=useState(false),[error,setError]=useState(''),router=useRouter();
 async function start(){if(pending||siteKey&&!token)return;setPending(true);setError('');try{
  const result=await authClient.signIn.anonymous({}, {headers:token?{'x-perplex-bot-token':token}:{}});if(result.error)throw new Error();router.replace('/workspace');router.refresh();
 }catch{setError('Guest access is unavailable or this browser has used its trial. Sign in with Google to continue.');setPending(false);setToken('');setChallengeVersion(v=>v+1);}}
 return <div>{siteKey&&<GuestChallenge key={challengeVersion} siteKey={siteKey} onToken={setToken}/>}<button className="button" disabled={pending||Boolean(siteKey&&!token)} onClick={()=>void start()}>{pending?'Starting your trial…':'Try 3 answers free'}</button>
 <p className="privacy-note">No payment details. Keep this browser session to access your trial. Sign in to save your history before it expires in 30 days.</p>{error&&<p role="alert" className="inline-error">{error}</p>}</div>;
}
