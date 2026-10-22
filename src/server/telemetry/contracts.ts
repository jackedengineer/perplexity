import {z} from 'zod';
import {PUBLIC_ERRORS} from '@/server/contracts/error-messages';
import {INPUT_REASONS} from '@/server/safety/provider';
import {safetyCategorySchema} from '@/server/safety/policy';
const publicCodes=Object.keys(PUBLIC_ERRORS) as [keyof typeof PUBLIC_ERRORS,...(keyof typeof PUBLIC_ERRORS)[]];
export const outcomeSchema=z.enum([...publicCodes,'ERROR','SUCCEEDED','UNKNOWN','SKIPPED','ALLOW','BLOCK','UNAVAILABLE','APPROVED','ACCEPTED','READY','NO_EVIDENCE','COMMITTED','ALREADY_COMMITTED','COMPLETED','ADMITTED']);
export const stageSchema=z.enum(['http.identity','http.request_limit','http.validation','http.admission','http.delivery','http.status','run.execute','input.accept','retrieval','answer.complete','safety.input','safety.query','safety.evidence','safety.output','search','answer.draft','citations','output.release','persistence.commit','persistence.fail']);
export type TelemetryStage=z.infer<typeof stageSchema>;
const count=z.int().min(0).max(1_000_000),money=z.string().regex(/^\d{1,16}$/u);
const version=z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/u);
export const runMetadataSchema=z.object({runId:z.uuid(),policyVersion:version.optional(),catalogVersion:version.optional(),priceVersion:version.optional(),entitlementVersion:version.optional(),accountingVersion:z.int().min(0).max(100).optional(),estimatedUpperBoundMicroUsd:money.optional(),estimateKind:z.literal('RESERVATION_CEILING').optional()});
// Strip unknown keys. Neither errors nor request/provider objects are serializable fields.
export const telemetryFieldsSchema=z.object({
 outcome:outcomeSchema.optional(),durationMs:z.number().finite().min(0).max(86_400_000).optional(),
 reason:z.enum([...INPUT_REASONS,'CITATION_INVALID','INVALID_PACKAGE']).optional(),categoryCodes:z.array(safetyCategorySchema).max(11).optional(),
 promptVersion:version.optional(),detectorVersion:version.optional(),
 modelId:z.string().regex(/^[a-z0-9-]+\/[A-Za-z0-9._:-]{1,100}$/u).max(128).optional(),actualModelMatch:z.enum(['MATCH','OTHER','UNAVAILABLE']).optional(),
 providerCallId:z.uuid().optional(),providerStage:z.enum(['INPUT_SAFETY','QUERY_SAFETY','SEARCH','EVIDENCE_SAFETY','ANSWER','OUTPUT_SAFETY']).optional(),
 inputTokens:count.nullable().optional(),outputTokens:count.nullable().optional(),searchCredits:count.nullable().optional(),
 knownCostMicroUsd:money.optional(),estimatedUpperBoundMicroUsd:money.optional(),heldMicroUsd:money.optional(),bookedMicroUsd:money.optional(),
 costState:z.enum(['KNOWN','PARTIAL','UNKNOWN']).optional(),estimateKind:z.literal('RESERVATION_CEILING').optional(),unknownCalls:count.optional(),
 answerCredits:count.optional(),sourceCount:count.optional(),discardedSources:count.optional(),returnedSources:count.optional(),
});
export type TelemetryFields=z.infer<typeof telemetryFieldsSchema>;
export const eventNameSchema=z.enum(['research.span','research.safety','research.sources','research.provider_started','research.usage','research.run_usage','research.first_progress','research.approved_delivery','research.telemetry_unavailable']);
export const telemetryEventSchema=telemetryFieldsSchema.extend({
 event:eventNameSchema,schemaVersion:z.literal(1),timestamp:z.iso.datetime(),requestId:z.uuid(),traceId:z.string().regex(/^[a-f0-9]{32}$/u),spanId:z.string().regex(/^[a-f0-9]{16}$/u),
 parentSpanId:z.string().regex(/^[a-f0-9]{16}$/u).optional(),stage:stageSchema.optional(),phase:z.enum(['START','END']).optional(),
 ...runMetadataSchema.partial().shape,
});
export type TelemetryEvent=z.infer<typeof telemetryEventSchema>;
export type OutcomeCategory='success'|'rate'|'quota'|'deadline'|'policy'|'infrastructure'|'access'|'state'|'validation';
export function outcomeCategory(outcome:string):OutcomeCategory {
 if(['RATE_LIMITED'].includes(outcome))return 'rate';
 if(outcome==='BUDGET_EXCEEDED')return 'quota';
 if(['DEADLINE_EXCEEDED','REQUEST_TIMEOUT'].includes(outcome))return 'deadline';
 if(['INPUT_BLOCKED','OUTPUT_BLOCKED','BLOCK'].includes(outcome))return 'policy';
 if(['ERROR','UNKNOWN','UNAVAILABLE','SAFETY_UNAVAILABLE','PROVIDER_UNAVAILABLE','CONFIGURATION_UNAVAILABLE'].includes(outcome))return 'infrastructure';
 if(['UNAUTHENTICATED','INVALID_ORIGIN','NOT_FOUND'].includes(outcome))return 'access';
 if(['CONFLICT','RUN_IN_PROGRESS','RUN_ALREADY_FINISHED'].includes(outcome))return 'state';
 if(['MALFORMED_JSON','TOO_LARGE','UNSUPPORTED_MEDIA_TYPE','INVALID_INPUT','IDEMPOTENCY_MISMATCH'].includes(outcome))return 'validation';
 return 'success';
}
