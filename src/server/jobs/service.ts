import 'server-only';
import {getDb} from '@/db';
import {getCurrentSession} from '@/lib/current-session';
import {getServerEnv} from '@/lib/env';
import {createRequestLimiter} from '@/server/runs/rate-limit';
import {parseAdmissionPolicyEnvironment} from '@/server/runs/env';
import {admitJob,listJobs,readJob,readEvents} from './admission';
import {cancelJob} from './worker';
import {createJobsHttp} from './http';
import {sandboxDatabaseUrl} from './connection';
export function jobsEnabled(){try{sandboxDatabaseUrl();return true;}catch{return false;}}
export const jobsHttp=createJobsHttp({enabled:jobsEnabled,subject:async()=>{const s=await getCurrentSession();return s&&!s.user.isAnonymous&&s.user.emailVerified?s.user.id:null;},origin:()=>getServerEnv().BETTER_AUTH_URL,
 consume:subject=>createRequestLimiter(getDb(),'jobs-http-v1',{userMinute:90,userDay:2000,anonymousMinute:1,anonymousDay:1}).consume('jobs:'+subject),
 backend:()=>{const db=getDb();return {list:s=>listJobs(db,s),admit:(s,body)=>admitJob(db,s,body,parseAdmissionPolicyEnvironment(process.env).operatorBudgetKey),read:(s,id)=>readJob(db,s,id),events:(s,id,c)=>readEvents(db,s,id,c),cancel:(s,id)=>cancelJob(db,s,id)};}});
