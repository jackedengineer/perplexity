import {sql} from 'drizzle-orm';
import {cancelJob} from './worker';
import {JobError} from './contracts';
import type {JobDatabase} from './store';
export async function removeJobContent(db:JobDatabase,subject:string,id:string){
 // Cancellation settles and fences work before content removal. A crash between
 // these commits leaves deletion safely retryable, with no success response.
 await cancelJob(db,subject,id);
 await db.transaction(async tx=>{
  await tx.execute(sql`SET LOCAL lock_timeout='2s'`);
  const [result]=await tx.select({removed:sql<boolean>`content.removed`}).from(sql`(SELECT perplex_delete_job_content(${id}::uuid,${subject}::text) AS removed) AS content`);
  if(result?.removed!==true)throw new JobError('NOT_FOUND');
 });
}
export async function pruneJobEvidence(db:JobDatabase){
 const [result]=await db.select({removed:sql<number>`content.removed`}).from(sql`(SELECT perplex_prune_job_evidence() AS removed) AS content`);
 return Number(result?.removed??0);
}
