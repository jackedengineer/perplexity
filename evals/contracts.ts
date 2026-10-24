import {z} from 'zod';
import {modelIdSchema} from '@/server/ai/models';
import {SAFETY_POLICY,safetyCategorySchema} from '@/server/safety/policy';
import {safetyInputSchema} from '@/server/safety/provider';
import {questionTextSchema} from '@/server/contracts/chat';
import {evidencePackageSchema} from '@/server/contracts/pipeline';
const id=z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/u);
const base={id,stage:z.enum(SAFETY_POLICY.requiredChecks),tag:id,locale:z.string().min(2).max(16),policyVersion:z.literal('v1'),labelSource:z.literal('SYNTHETIC_AUTHOR'),humanReviewed:z.boolean().default(false),text:questionTextSchema,context:safetyInputSchema.shape.context.default([])};
export const faultSchema=z.enum(['MISSING','THROW','MALFORMED','STALE','CONTRADICTORY','EXPIRED','CANCELLED']);
export const safetyCaseSchema=z.discriminatedUnion('test',[
 z.strictObject({...base,test:z.literal('SEMANTIC'),critical:z.literal(false),expected:z.enum(['ALLOW','BLOCK']),categories:z.array(safetyCategorySchema).max(11)}),
 z.strictObject({...base,test:z.literal('INPUT_DETECTOR'),stage:z.literal('INPUT'),critical:z.literal(true),expected:z.enum(['ALLOW','BLOCK'])}),
 z.strictObject({...base,test:z.literal('SERVICE_FAILURE'),critical:z.literal(true),expected:z.literal('UNAVAILABLE'),fault:faultSchema}),
 z.strictObject({...base,test:z.literal('OUTPUT_CONTRACT'),stage:z.literal('OUTPUT'),critical:z.literal(true),expected:z.literal('BLOCK')}),
]);
export type SafetyCase=z.infer<typeof safetyCaseSchema>;
export const answerCaseSchema=z.strictObject({id,scenario:id,labelSource:z.literal('SYNTHETIC_AUTHOR'),question:questionTextSchema,
 kind:z.enum(['ANSWER','CLARIFICATION','NO_EVIDENCE']),referenceMarkdown:questionTextSchema,
 passages:z.array(z.strictObject({title:z.string().min(1).max(300),text:questionTextSchema})).max(5),expectedCitationValid:z.boolean()});
export type AnswerCase=z.infer<typeof answerCaseSchema>;
const measured={elapsedMs:z.number().finite().min(0).max(600_000).optional(),costMicroUsd:z.string().regex(/^\d{1,16}$/u).nullable().optional()};
export const safetyObservationSchema=z.strictObject({id,decision:z.enum(['ALLOW','BLOCK','UNAVAILABLE']),...measured,
 categoryCodes:z.array(safetyCategorySchema).max(11).optional(),
 humanReviewedCompletion:z.boolean().default(false),harmfulCompletion:z.boolean().nullable().default(null)})
 .refine(r=>r.harmfulCompletion===null||r.humanReviewedCompletion&&r.decision==='ALLOW')
 .refine(r=>r.categoryCodes===undefined||new Set(r.categoryCodes).size===r.categoryCodes.length&&(r.decision==='BLOCK'?r.categoryCodes.length>0:r.categoryCodes.length===0));
const support=z.enum(['SUPPORTED','UNSUPPORTED','UNCERTAIN']);
export const answerObservationSchema=z.strictObject({id,disposition:z.enum(['ANSWER','REFUSAL','ERROR','NO_EVIDENCE','CLARIFICATION']),
 markdown:questionTextSchema,evidence:evidencePackageSchema,...measured,
 humanReviewed:z.boolean().default(false),claims:z.array(z.strictObject({start:z.int().min(0),end:z.int().positive(),support:support.nullable(),judgeSupport:support.nullable().optional()})).max(100),
}).superRefine((r,ctx)=>{
 let previousEnd=0;
 for(const c of r.claims){
  if(c.start<previousEnd||c.end>r.markdown.length||c.start>=c.end||!r.markdown.slice(c.start,c.end).trim()||!r.markdown.slice(c.start,c.end).isWellFormed()||c.support!==null&&!r.humanReviewed||r.disposition!=='ANSWER')ctx.addIssue({code:'custom',message:'Invalid reviewed claim span'});
  previousEnd=c.end;
 }
});
export const manifestSchema=z.strictObject({schemaVersion:z.literal(1),corpusHash:z.string().regex(/^[a-f0-9]{64}$/u),sourceRevision:z.string().regex(/^[a-f0-9]{40}$/u),sourceDirty:z.boolean(),
 policyVersion:z.literal('v1'),mode:z.enum(['OFFLINE','MANUAL_LIVE']),models:z.strictObject({safety:modelIdSchema.nullable(),answer:modelIdSchema.nullable()}),judge:z.strictObject({modelId:modelIdSchema,promptVersion:z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/u)}).nullable(),promptVersions:z.strictObject({input:z.enum(['input-v1','input-v2','input-v3','input-v4','input-v5','input-v6','input-v7','input-v8','input-v9','input-v10']),query:z.enum(['input-v1','input-v2','input-v3','input-v4','input-v5','input-v6','input-v7','input-v8','input-v9','input-v10']),evidence:z.enum(['evidence-v1','evidence-v2','evidence-v3','evidence-v4','evidence-v5']),output:z.enum(['output-v1','output-v2','output-v3','output-v4','output-v5','output-v6','output-v7','output-v8']),answer:z.enum(['answer-v1','answer-v2','answer-v3','answer-v4','answer-v5','answer-v6','answer-v7','answer-v8','answer-v9']),detector:z.literal('input-v1')})});
