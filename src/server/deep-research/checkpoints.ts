import {createHash} from 'node:crypto';
import {and,eq} from 'drizzle-orm';
import {jobCheckpoints} from '@/db/schema';
import type {JobDatabase} from '@/server/jobs/store';
import {JobError} from '@/server/jobs/contracts';
function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
export function checkpointHash(value:unknown){
 const encoded=canonical(JSON.parse(JSON.stringify(value)));
 if(Buffer.byteLength(encoded)>180000)throw new JobError('INVALID_INPUT');
 return createHash('sha256').update(encoded).digest('hex');
}
export async function readCheckpoint(db:JobDatabase,id:string,step:string):Promise<unknown>{
 const [row]=await db.select().from(jobCheckpoints).where(and(eq(jobCheckpoints.jobId,id),eq(jobCheckpoints.step,step)));
 if(!row||checkpointHash(row.value)!==row.hash)throw new JobError('UNAVAILABLE');return row.value;
}
