import {and,eq,isNull} from 'drizzle-orm';
import {durableJobs,jobPeriods,jobResearchInputs} from '@/db/schema';
import {JobError} from '@/server/jobs/contracts';
import type {JobEnvironment} from '@/server/jobs/configuration';
import type {JobTransaction} from '@/server/jobs/store';
import {researchSnapshot} from './contracts';
import {clarificationHistory,researchContinuation,scopeDecision} from './scope';
import {readCheckpoint} from './checkpoints';
import type {z} from 'zod';
export async function readContinuation(tx:JobTransaction,owner:string,environment:JobEnvironment,question:string,continuation?:z.infer<typeof researchContinuation>){
 if(!continuation)return {clarifications:[],clarificationRounds:0};
 const [row]=await tx.select({job:durableJobs,snapshot:jobResearchInputs.snapshot}).from(durableJobs)
  .innerJoin(jobPeriods,eq(durableJobs.periodId,jobPeriods.id)).innerJoin(jobResearchInputs,eq(durableJobs.id,jobResearchInputs.jobId))
  .where(and(eq(durableJobs.id,continuation.jobId),eq(durableJobs.userId,owner),eq(jobPeriods.environment,environment),isNull(durableJobs.deletedAt))).for('share',{of:durableJobs});
 if(!row)throw new JobError('NOT_FOUND');
 const saved=researchSnapshot.parse(row.snapshot);
 if(row.job.state!=='NEEDS_INPUT'||saved.version!=='deep-research-v2'||saved.question!==question||(saved.clarificationRounds??0)>=2)throw new JobError('INVALID_INPUT');
 const scope=scopeDecision.parse(await readCheckpoint(tx,continuation.jobId,'plan'));
 if(scope.action!=='CLARIFY'||continuation.answers.length!==scope.questions.length||new Set(continuation.answers.map(a=>a.id)).size!==scope.questions.length)throw new JobError('INVALID_INPUT');
 const turns=scope.questions.map(q=>{const answer=continuation.answers.find(a=>a.id===q.id)?.answer;if(!answer)throw new JobError('INVALID_INPUT');return {question:q.question,answer};});
 return {clarifications:clarificationHistory.parse([...(saved.clarifications??[]),...turns]),clarificationRounds:(saved.clarificationRounds??0)+1};
}
