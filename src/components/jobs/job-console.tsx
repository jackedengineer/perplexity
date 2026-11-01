'use client';
import {ResearchReport} from './research-report';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import type {JobView,JobEvent} from '@/server/jobs/contracts';
import './jobs.css';
type Summary={id:string;state:string;createdAt:string;workflow?:string;question?:string|null};
const messages:Record<string,string>={QUEUED:'Waiting for a worker',RUNNING:'Worker connected',STEP_STARTED:'Checkpoint started',STEP_COMPLETED:'Checkpoint saved',RECOVERED:'Resuming from saved progress',CANCELLED:'Execution stopped',COMPLETED:'Execution check complete',FAILED:'Execution needs attention',EXPIRED:'Execution window ended',COST_UNKNOWN:'Uncertain cost remains reserved'};
const researchMessages:Record<string,string>={STEP_STARTED:'Working on',STEP_COMPLETED:'Saved',COMPLETED:'Research complete'};
class JobHttpError extends Error{constructor(message:string,public status:number){super(message);}}
async function responseBody(response:Response){let body;try{body=await response.json();}catch{throw new JobHttpError('The service could not be reached. Please try again.',response.status);}
 if(!response.ok)throw new JobHttpError(body.error?.message??'Please try again in a moment.',response.status);return body;}
export function JobConsole({initialJobs,initialId,billingAvailable,deepAvailable=false}:{initialJobs:Summary[];initialId:string|null;billingAvailable:boolean;deepAvailable?:boolean}){
 const router=useRouter(),[id,setId]=useState(initialId),[job,setJob]=useState<JobView|null>(null),[events,setEvents]=useState<JobEvent[]>([]);
 const [expanded,setExpanded]=useState(false);
 const [question,setQuestion]=useState(''),[mode,setMode]=useState<'research'|'check'>(deepAvailable?'research':'check');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),intent=useRef<string|null>(null);
 useEffect(()=>{
  if(!id)return;const controller=new AbortController();let cursor=0,failures=0,timer:ReturnType<typeof setTimeout>;
  async function poll(){
   try{
    const body=await responseBody(await fetch(`/api/jobs/${id}?after=${cursor}`,{signal:controller.signal,cache:'no-store'}));
    if(controller.signal.aborted)return;
    const incoming=body.events as JobEvent[];cursor=incoming.at(-1)?.sequence??cursor;
    failures=0;setJob(body.job);setEvents(previous=>{const before=previous.filter(e=>e.sequence<=(incoming[0]?.sequence??Infinity)-1);return [...before,...incoming];});setError('');
    if(['QUEUED','RUNNING'].includes(body.job.state)||cursor<body.job.cursor)timer=setTimeout(poll,document.hidden?10000:2000);
   }catch(e){if(!controller.signal.aborted){const reconnect=!(e instanceof JobHttpError)||[408,429,500,502,503,504].includes(e.status);setError(reconnect?'Connection interrupted. Reconnecting to saved progress…':e instanceof Error?e.message:'Connection interrupted. Your job is saved.');if(reconnect&&failures++<5)timer=setTimeout(poll,Math.min(15000,2000*2**failures));}}
  }
  void poll();return()=>{controller.abort();clearTimeout(timer);};
 },[id,retry]);
 async function start(){
  if(busy)return;setBusy(true);setError('');intent.current??=crypto.randomUUID();
  try{
   const body=await responseBody(await fetch('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mode==='research'?{version:1,workflow:'deep-research-v1',question,locale:'en',requestId:intent.current}:{version:1,workflow:'execution-check-v1',requestId:intent.current})}));
   setEvents([]);setJob(null);setId(body.id);router.replace(`/jobs?job=${body.id}`,{scroll:false});intent.current=null;
  }catch(e){setError(e instanceof Error?e.message:'Could not start. Retry uses the same request.');}finally{setBusy(false);}
 }
 async function cancel(){if(!id||busy)return;setBusy(true);setError('');try{
  const body=await responseBody(await fetch(`/api/jobs/${id}/cancel`,{method:'POST'}));setJob(body.job);setRetry(n=>n+1);
 }catch(e){setError(e instanceof Error?e.message:'Could not confirm cancellation. Retry Stop.');}finally{setBusy(false);}}
 const active=job&&['QUEUED','RUNNING'].includes(job.state);
 const compact=job?.workflow==='deep-research-v1'&&events.length>6,visibleEvents=compact&&!expanded?events.slice(-6):events;
 return <section className="jobs-page" aria-labelledby="jobs-heading">
  <header><span className="jobs-eyebrow">PRO · TEST ENVIRONMENT</span><h1 id="jobs-heading">{deepAvailable?'Deep Research':'Durable execution'}</h1><p>Your work can keep going when you leave. Saved checkpoints let a worker resume safely.</p></header>
  {deepAvailable&&<div className="deep-modes" role="group" aria-label="Work type"><button aria-pressed={mode==='research'} onClick={()=>setMode('research')} disabled={busy}>Deep Research</button><button aria-pressed={mode==='check'} onClick={()=>setMode('check')} disabled={busy}>Execution check</button></div>}
  <section className="jobs-card" aria-labelledby="execution-title"><div className="jobs-card-heading"><div><h2 id="execution-title">{mode==='research'?'Explore a question in depth':'Execution check'}</h2><p>{mode==='research'?'Two research rounds, selected-page reading, and a cited report.':'Tests saved progress, recovery and Stop. No AI, web searches or browser actions.'}</p></div><span className="jobs-badge">Sandbox</span></div>
   {mode==='research'?<div className="deep-composer"><label htmlFor="research-question">Research question</label><textarea id="research-question" value={question} maxLength={1000} rows={4} placeholder="What would you like to understand? Include your constraints and timeframe." disabled={busy} onChange={e=>{setQuestion(e.target.value);intent.current=null;}}/><small>{question.length}/1,000 · Pro test access · up to 15 minutes</small></div>:<p className="jobs-note">This check does not generate a research report or perform a task.</p>}
   <div className="jobs-actions"><button className="jobs-primary" onClick={start} disabled={busy||!!active||!!id&&!job||mode==='research'&&!question.trim()}>{busy&&!active?'Starting…':mode==='research'?'Start research':'Run execution check'}</button>{billingAvailable&&<Link href="/billing">Pro test subscription ↗</Link>}</div>
  </section>
  {id&&<section className="jobs-card" aria-labelledby="progress-title" aria-busy={!job&&!error}><div className="jobs-card-heading"><div><h2 id="progress-title">{job?.workflow==='deep-research-v1'&&job.state==='COMPLETED'?'Research report ready':job?messages[job.state]??job.state:'Loading saved progress…'}</h2><p>Closing this page does not cancel the job.</p></div>{active&&<button className="jobs-stop" disabled={busy} onClick={cancel}>{busy?'Stopping…':'Stop'}</button>}</div>
   {job?.notice&&<p className="jobs-note" role="status">{job.notice}</p>}
   {job?.question&&<p className="deep-question">{job.question}</p>}
   <ol className="jobs-timeline" aria-label="Saved progress">{visibleEvents.map(event=><li key={event.sequence}><span className="jobs-dot"/><div>{job?.workflow==='deep-research-v1'?(researchMessages[event.code]??messages[event.code]):messages[event.code]}{event.step&&<small>{event.step.replaceAll('-',' ')}</small>}</div><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time></li>)}</ol>{compact&&<button className="jobs-progress-toggle" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Show recent updates':`Show all ${events.length} updates`}</button>}
   {job?.state==='COMPLETED'&&job.workflow==='execution-check-v1'&&<p className="jobs-receipt">All three checkpoints are saved. This was an execution check; no AI answer was generated.</p>}
   {job&&job.heldMicroUsd!=='0'&&<p className="jobs-note">An uncertain provider cost remains reserved for reconciliation.</p>}
  </section>}
  {job?.report&&<ResearchReport report={job.report}/>}
  {error&&<div className="jobs-error" role="alert"><p>{error}</p>{id&&<button onClick={()=>setRetry(n=>n+1)}>Reconnect to saved progress</button>}</div>}
  {initialJobs.length>0&&<section className="jobs-history"><h2>Recent work</h2>{initialJobs.map(j=><Link key={j.id} href={`/jobs?job=${j.id}`} onClick={()=>{setEvents([]);setJob(null);setId(j.id);setRetry(n=>n+1);}}><span title={j.question??undefined}>{j.question??(j.workflow==='deep-research-v1'?'Deep Research':'Execution check')}</span><span>{j.id===job?.id?job.state:j.state}<small>{new Date(j.createdAt).toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'})}</small></span></Link>)}</section>}
 </section>;
}
