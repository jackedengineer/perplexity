import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({headers:vi.fn(),moduleLoaded:vi.fn(),auth:vi.fn(),getSession:vi.fn(),revoke:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({headers:mocks.headers}));
vi.mock('@/lib/auth',()=>{mocks.moduleLoaded();return {getAuth:mocks.auth};});
const identity={session:{id:'native-session',token:'signed-value',createdAt:new Date(),expiresAt:new Date(Date.now()+60000)},
 user:{id:'person',name:'Reader',email:'reader@example.test',emailVerified:true}};
beforeEach(()=>{
 vi.resetModules();vi.clearAllMocks();
 mocks.auth.mockReturnValue({api:{getSession:mocks.getSession},$context:Promise.resolve({internalAdapter:{deleteSession:mocks.revoke}})});
});
afterEach(()=>vi.unstubAllEnvs());
it('avoids loading auth/database code when there is no Cookie header',async()=>{
 mocks.headers.mockResolvedValue(new Headers());
 const {getCurrentSession}=await import('@/lib/current-session');
 expect(await getCurrentSession()).toBeNull();
 expect(mocks.moduleLoaded).not.toHaveBeenCalled();expect(mocks.auth).not.toHaveBeenCalled();
});
it.each(['perplex.session_token=signed-value','__Secure-perplex.session_token=signed-value','unrelated=preference'])('still verifies every request carrying cookies: %s',async cookie=>{
 const headers=new Headers({cookie});mocks.headers.mockResolvedValue(headers);mocks.getSession.mockResolvedValue(identity);
 const {getCurrentSession}=await import('@/lib/current-session');
 expect(await getCurrentSession()).toMatchObject({sessionId:'native-session',user:{id:'person'}});
 expect(mocks.auth).toHaveBeenCalledTimes(1);
 expect(mocks.getSession).toHaveBeenCalledWith({headers,query:{disableRefresh:true}});
});
it('retains expiry revocation on the authenticated path',async()=>{
 mocks.headers.mockResolvedValue(new Headers({cookie:'perplex.session_token=expired'}));
 mocks.getSession.mockResolvedValue({...identity,session:{...identity.session,expiresAt:new Date(Date.now()-1000)}});
 const {getCurrentSession}=await import('@/lib/current-session');
 expect(await getCurrentSession()).toBeNull();expect(mocks.revoke).toHaveBeenCalledWith('signed-value');
});
it('never treats an invalid cookie as an authenticated session',async()=>{
 mocks.headers.mockResolvedValue(new Headers({cookie:'perplex.session_token=forged'}));mocks.getSession.mockResolvedValue(null);
 const {getCurrentSession}=await import('@/lib/current-session');
 expect(await getCurrentSession()).toBeNull();expect(mocks.getSession).toHaveBeenCalledTimes(1);
});
