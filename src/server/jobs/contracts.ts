import {consensusManifest} from '@/server/deep-research/consensus-models';
import {z} from 'zod';
import {researchInput,deepResearch} from '@/server/deep-research/contracts';
export const isResearch=(workflow:string)=>workflow==='deep-research-v1'||workflow==='deep-research-v2';
export const jobSubmission=z.discriminatedUnion('workflow',[z.strictObject({version:z.literal(1),workflow:z.literal('execution-check-v1'),requestId:z.uuid()}),researchInput.extend({version:z.literal(1),workflow:z.literal('deep-research-v1'),requestId:z.uuid()}),researchInput.extend({version:z.literal(1),workflow:z.literal('deep-research-v2'),requestId:z.uuid()})]);
export const jobCursor=z.coerce.number().int().min(0).max(1_000_000);
export const jobId=z.uuid();
export const jobStates=['QUEUED','RUNNING','COMPLETED','CANCELLED','FAILED','EXPIRED'] as const;
export type JobState=typeof jobStates[number];
export const activeJob=(state:string)=>state==='QUEUED'||state==='RUNNING';
// Only server-owned, versioned manifests can select steps, limits or executors.
export const executionCheck={version:'execution-check-v1',deadlineMs:120_000,leaseMs:15_000,
 steps:[{key:'checkpoint',kind:'SYSTEM',capMicroUsd:0n},{key:'resume',kind:'SYSTEM',capMicroUsd:0n},{key:'verify',kind:'SYSTEM',capMicroUsd:0n}]} as const;
export function manifestFor(workflow:string){if(workflow===executionCheck.version)return executionCheck;if(workflow===consensusManifest.version)return consensusManifest;if(workflow===deepResearch.version)return deepResearch;throw new JobError('INVALID_INPUT');}
export const progressCodes=['QUEUED','RUNNING','STEP_STARTED','STEP_COMPLETED','RECOVERED','CANCELLED','COMPLETED','FAILED','EXPIRED','COST_UNKNOWN'] as const;
export type ProgressCode=typeof progressCodes[number];
export type JobView={id:string;workflow:string;question?:string;notice?:string;state:JobState;createdAt:string;deadlineAt:string;cursor:number;heldMicroUsd:string;spentMicroUsd:string;report?:import('@/server/deep-research/view').PublicResearchReport};
export type JobEvent={sequence:number;code:ProgressCode;step:string|null;createdAt:string};
export class JobError extends Error {
 constructor(public code:'DISABLED'|'NOT_FOUND'|'PAYMENT_REQUIRED'|'CONFLICT'|'QUOTA'|'STALE'|'INVALID_INPUT'|'UNAVAILABLE'|'INPUT_BLOCKED'|'REDACT_SECRET'){super(code);}
}
