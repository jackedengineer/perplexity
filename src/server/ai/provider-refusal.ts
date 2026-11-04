import {z} from 'zod';
// Inspect protocol fields only. Never log or display flagged input, provider
// messages or moderation metadata; billing/permission 403s are not policy blocks.
export function providerRefused(value:unknown):boolean {
 const result=z.object({choices:z.array(z.object({finish_reason:z.string().nullable().optional(),message:z.object({refusal:z.string().nullable().optional()}).optional()})).optional()}).safeParse(value);
 return !!result.success&&!!result.data.choices?.some(c=>c.finish_reason==='content_filter'||!!c.message?.refusal);
}
export function moderationError(value:unknown):boolean {
 const result=z.object({error:z.object({metadata:z.object({error_type:z.string().optional(),reasons:z.array(z.string()).optional(),provider_name:z.string().optional()}).optional()})}).safeParse(value);
 if(!result.success)return false;
 const meta=result.data.error.metadata;
 return meta?.error_type==='content_policy_violation'||meta?.error_type==='refusal'||!!(meta?.reasons?.length&&meta.provider_name);
}
