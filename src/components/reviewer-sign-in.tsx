'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import {authClient} from '@/lib/auth-client';

export function ReviewerSignIn(){
  const router=useRouter();
  const [email,setEmail]=useState(''),[password,setPassword]=useState('');
  const [pending,setPending]=useState(false),[failed,setFailed]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(pending)return;
    setPending(true);setFailed(false);
    try{
      const result=await authClient.signIn.email({email,password,rememberMe:false});
      if(result.error)throw new Error('Review sign-in failed');
      setPassword('');router.replace('/workspace');router.refresh();
    }catch{setFailed(true);setPassword('');setPending(false);}
  }
  return <form className="reviewer-form" onSubmit={submit} aria-busy={pending}>
    <div><label htmlFor="reviewer-email">Review account email</label>
      <input id="reviewer-email" type="email" autoComplete="username" required maxLength={254}
        value={email} onChange={event=>setEmail(event.target.value)} disabled={pending}/></div>
    <div><label htmlFor="reviewer-password">Review account password</label>
      <input id="reviewer-password" type="password" autoComplete="current-password" required minLength={8} maxLength={128}
        value={password} onChange={event=>setPassword(event.target.value)} disabled={pending}
        aria-describedby={failed?'reviewer-error':undefined}/></div>
    <button className="button" disabled={pending} type="submit">
      {pending&&<span className="spinner" aria-hidden="true"/>}{pending?'Signing in…':'Sign in for review'}
    </button>
    <div className="reviewer-feedback" aria-live="polite">{failed&&<p id="reviewer-error" role="alert">We couldn’t sign you in. Check your review credentials, or contact the operator if access has expired. Please wait before trying again.</p>}</div>
  </form>;
}
