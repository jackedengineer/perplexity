import {expect,it} from 'vitest';
import {sanitizeAuthRequest} from '@/server/auth/request';
it.each(['GET','POST'])('sanitizes a Next-style proxied %s request without losing its body or origin',async method=>{
 const input=new Request('http://localhost:3000/api/auth/sign-in/anonymous',{method,headers:{origin:'http://localhost:3000','x-perplex-guest-validated':'forged'},...(method==='POST'?{body:'{}'}:{})});
 const proxied=new Proxy(input,{get:(target,key)=>Reflect.get(target,key,target)});
 expect(()=>new Request(proxied)).toThrow();
 const copy=sanitizeAuthRequest(proxied);
 expect(copy.headers.has('x-perplex-guest-validated')).toBe(false);
 expect(copy.headers.get('origin')).toBe('http://localhost:3000');
 expect(copy.method).toBe(method);expect(await copy.text()).toBe(method==='POST'?'{}':'');
});
