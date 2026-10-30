import {expect,it} from 'vitest';
import {isOperator} from '@/server/operations/access';
it('requires an explicit subject allowlist and a verified registered session',()=>{
 const identity={user:{id:'owner-id',emailVerified:true,isAnonymous:false}};
 expect(isOperator(null,'owner-id')).toBe(false);
 expect(isOperator(identity,undefined)).toBe(false);
 expect(isOperator(identity,'other-owner')).toBe(false);
 expect(isOperator({...identity,user:{...identity.user,emailVerified:false}},'owner-id')).toBe(false);
 expect(isOperator({...identity,user:{...identity.user,isAnonymous:true}},'owner-id')).toBe(false);
 expect(isOperator(identity,' owner-id,second ')).toBe(true);
});
