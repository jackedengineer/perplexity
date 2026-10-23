import * as z from 'zod/mini';
export const feedbackView=z.strictObject({rating:z.nullable(z.enum(['HELPFUL','NOT_HELPFUL'])),reason:z.nullable(z.enum(['MISSING_EVIDENCE','WRONG_INTERPRETATION','FALSE_REFUSAL'])),version:z.int().check(z.minimum(0),z.maximum(2147483647))});
export type FeedbackView=z.infer<typeof feedbackView>;
