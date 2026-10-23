import {createReleaseGate} from '@/server/safety/release';
import type {SafetyProvider} from '@/server/safety/provider';
import type {AdmissionDatabase} from './usage';
import {createProviderCalls,recordSafetyProvider} from './provider-calls';
import {createFinalization} from './finalize';
import {AdmissionError} from './errors';
export async function clarifyRun(db:AdmissionDatabase,subject:string,sessionId:string,run:{id:string;revision:number;deadlineAt:string},question:string,clarification:string,output:SafetyProvider,signal:AbortSignal){
 const approved=await createReleaseGate(recordSafetyProvider(createProviderCalls(db,subject,run.id),'OUTPUT_SAFETY',output)).approve({runId:run.id,attemptVersion:1,revision:run.revision,kind:'CLARIFICATION',question,markdown:clarification,evidence:{runId:run.id,sources:[],passages:[]}},{signal,deadlineAt:new Date(run.deadlineAt)});
 if(approved.kind==='DENIED')throw new AdmissionError(approved.code);
 const saved=await createFinalization(db).commit(subject,sessionId,approved.response,signal);
 if(saved.kind==='DENIED')throw new AdmissionError(saved.code);
}
