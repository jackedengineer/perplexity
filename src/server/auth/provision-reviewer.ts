import {randomUUID} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
import {or,eq,sql} from 'drizzle-orm';
import {user,account} from '@/db/schema';
import type {AdmissionDatabase} from '@/server/runs/usage';
import {reviewerConfiguration} from '@/lib/reviewer-policy';

// Operator-only utility. No HTTP route, existing-account update, entitlement grant,
// API key or authentication bypass is installed by provisioning this identity.
export async function provisionReviewer(db:AdmissionDatabase,raw:string,origin:string,password:string){
  const policy=reviewerConfiguration(raw,origin);
  if(!policy||password.length<12||password.length>128)throw new Error('Invalid reviewer configuration');
  const passwordHash=await hashPassword(password);
  return db.transaction(async tx=>{
    const prior=await tx.select({id:user.id}).from(user).where(or(eq(user.id,policy.subject),sql`lower(${user.email})=${policy.email}`)).limit(1);
    if(prior.length)throw new Error('Reviewer identity already exists; refusing to replace credentials');
    if(!reviewerConfiguration(raw,origin))throw new Error('Expired reviewer configuration');
    await tx.insert(user).values({id:policy.subject,name:'Razorpay review',email:policy.email,
      // Operator-attested application test identity, not proof of Gmail ownership.
      emailVerified:true,isAnonymous:false,createdAt:new Date(policy.issuedAt),updatedAt:new Date(policy.issuedAt)});
    await tx.insert(account).values({id:randomUUID(),userId:policy.subject,accountId:policy.subject,providerId:'credential',password:passwordHash});
    return policy;
  });
}
