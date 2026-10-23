import 'server-only';
import {getDb} from '@/db';
import {getCurrentSession} from '@/lib/current-session';
import {getServerEnv} from '@/lib/env';
import {createRequestLimiter} from '@/server/runs/rate-limit';
import {createFeedbackRepository} from './repository';
import {createFeedbackHttp} from './http';
export const feedbackHttp=createFeedbackHttp({identity:getCurrentSession,repository:()=>createFeedbackRepository(getDb()),origin:()=>getServerEnv().BETTER_AUTH_URL,consume:subject=>createRequestLimiter(getDb(),'feedback').consume(subject),log:event=>console.info(JSON.stringify(event))});
