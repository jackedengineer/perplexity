import {z} from 'zod';

export const REVIEWER_MAX_AGE_MS=7*86400000;
const configuration=z.strictObject({
  version:z.literal(1),subject:z.string().refine(value=>value.startsWith('reviewer-')&&z.uuid().safeParse(value.slice(9)).success),
  email:z.email().max(254).transform(value=>value.toLowerCase()),origin:z.url(),
  issuedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),
});
export type ReviewerConfiguration=z.infer<typeof configuration>;
export const isReviewerSubject=(id:string)=>id.startsWith('reviewer-');

export function reviewerConfiguration(raw:string|undefined,origin:string|undefined,now=Date.now()):ReviewerConfiguration|null{
  if(!raw||raw.length>2048)return null;
  try{
    const value=configuration.parse(JSON.parse(raw)),start=Date.parse(value.issuedAt),end=Date.parse(value.expiresAt);
    if(value.origin!==origin||end<=start||end-start>REVIEWER_MAX_AGE_MS||now<start||now>=end)return null;
    return value;
  }catch{return null;}
}

export function reviewerSessionAllowed(user:{id:string;email:string;emailVerified:boolean;createdAt?:Date},raw:string|undefined,origin:string|undefined,now=Date.now()){
  if(!isReviewerSubject(user.id))return true;
  const policy=reviewerConfiguration(raw,origin,now);
  return !!policy&&user.id===policy.subject&&user.email.toLowerCase()===policy.email&&user.emailVerified&&
    user.createdAt instanceof Date&&user.createdAt.getTime()===Date.parse(policy.issuedAt);
}
