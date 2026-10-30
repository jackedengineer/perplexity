export function isOperator(identity:{user:{id:string;emailVerified:boolean;isAnonymous:boolean}}|null,subjects:string|undefined) {
 return Boolean(identity&&identity.user.emailVerified&&!identity.user.isAnonymous&&
  (subjects??'').split(',').map(s=>s.trim()).filter(Boolean).includes(identity.user.id));
}
