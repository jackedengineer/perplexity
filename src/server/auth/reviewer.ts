import {APIError,createAuthMiddleware,getSessionFromCtx} from 'better-auth/api';
import {isReviewerSubject,reviewerConfiguration} from '@/lib/reviewer-policy';

export function reviewerAuthGuard(raw:string|undefined,origin:string){
  return createAuthMiddleware(async ctx=>{
    const denied=()=>new APIError('FORBIDDEN',{message:'Review sign-in is unavailable or the credentials are invalid.'});
    // No public password registration, recovery or replacement capability is added.
    if(['/sign-up/email','/set-password','/change-password','/request-password-reset'].includes(ctx.path)||ctx.path.startsWith('/reset-password'))throw denied();
    if(ctx.path==='/sign-in/email'){
      const policy=reviewerConfiguration(raw,origin),email=ctx.body?.email,password=ctx.body?.password;
      if(!policy||typeof email!=='string'||email.length>254||email.toLowerCase()!==policy.email||
        typeof password!=='string'||password.length<8||password.length>128)throw denied();
      const found=await ctx.context.internalAdapter.findUserByEmail(policy.email);
      if(found?.user.id!==policy.subject||!found.user.emailVerified)throw denied();
    }
    if(['/update-user','/change-email','/link-social','/unlink-account','/delete-user'].includes(ctx.path)){
      const session=await getSessionFromCtx(ctx,{disableRefresh:true});
      if(session&&isReviewerSubject(session.user.id))throw denied();
    }
  });
}
