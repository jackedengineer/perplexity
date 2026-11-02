import {expect,it} from 'vitest';
import {reviewerConfiguration,reviewerSessionAllowed} from '@/lib/reviewer-policy';
const now=Date.parse('2026-11-02T04:00:00Z'),origin='https://app.example.test';
const base={version:1,subject:'reviewer-11111111-1111-4111-8111-111111111111',email:'reviewer@example.test',origin,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+7*86400000).toISOString()};
it('accepts the exact seven-day origin-bound configuration until its fixed end',()=>{
 expect(reviewerConfiguration(JSON.stringify(base),origin,now)?.subject).toBe(base.subject);
 expect(reviewerConfiguration(JSON.stringify(base),origin,now+7*86400000-1)).not.toBeNull();
 expect(reviewerConfiguration(JSON.stringify(base),origin,now+7*86400000)).toBeNull();
});
it('fails closed on malformed, missing, future, excessive-duration or wrong-origin configuration',()=>{
 for(const raw of [undefined,'not-json','{}',JSON.stringify({...base,extra:true}),JSON.stringify({...base,subject:'reviewer-not-a-uuid'}),JSON.stringify({...base,expiresAt:new Date(now+8*86400000).toISOString()})])expect(reviewerConfiguration(raw,origin,now)).toBeNull();
 expect(reviewerConfiguration(JSON.stringify(base),'https://preview.example.test',now)).toBeNull();
 expect(reviewerConfiguration(JSON.stringify(base),origin,now-1)).toBeNull();
});
it('requires the exact verified subject/email and denies reserved reviewer identities after disabling',()=>{
 const user={id:base.subject,email:base.email,emailVerified:true},raw=JSON.stringify(base);
 expect(reviewerSessionAllowed(user,raw,origin,now)).toBe(true);
 expect(reviewerSessionAllowed({...user,id:'reviewer-other'},raw,origin,now)).toBe(false);
 expect(reviewerSessionAllowed({...user,email:'other@example.test'},raw,origin,now)).toBe(false);
 expect(reviewerSessionAllowed({...user,emailVerified:false},raw,origin,now)).toBe(false);
 expect(reviewerSessionAllowed(user,undefined,origin,now)).toBe(false);
 expect(reviewerSessionAllowed({...user,id:'normal-google-user'},undefined,origin,now)).toBe(true);
});
