import {z} from 'zod';
export const feedbackInput=z.strictObject({rating:z.enum(['HELPFUL','NOT_HELPFUL']),reason:z.enum(['MISSING_EVIDENCE','WRONG_INTERPRETATION','FALSE_REFUSAL']).nullable(),expectedVersion:z.int().min(0).max(2147483646)})
 .refine(v=>v.rating==='NOT_HELPFUL'||v.reason===null);
export type FeedbackInput=z.infer<typeof feedbackInput>;
