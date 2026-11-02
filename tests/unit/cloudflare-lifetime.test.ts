import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {EventEmitter} from 'node:events';
const mocks=vi.hoisted(()=>({pool:vi.fn(),auth:vi.fn(),instances:[] as EventEmitter[]}));
vi.mock('server-only',()=>({}));
vi.mock('pg',()=>({Pool:class extends EventEmitter{
 constructor(options:unknown){super();mocks.pool(options);mocks.instances.push(this);}
}}));
vi.mock('drizzle-orm/node-postgres',()=>({drizzle:(pool:unknown)=>({pool})}));
vi.mock('@/lib/env',()=>({getServerEnv:()=>({DATABASE_URL:'postgresql://localhost/lifetime'})}));
vi.mock('@/lib/auth-factory',()=>({createAuth:()=>{const auth={};mocks.auth(auth);return auth;}}));
beforeEach(()=>{vi.resetModules();mocks.instances.length=0;});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it('keeps database and auth instances separate between Workers requests',async()=>{
 vi.stubEnv('DEPLOYMENT_PLATFORM','cloudflare');
 const {getDb}=await import('@/db'),{getAuth}=await import('@/lib/auth');
 expect(getDb()).not.toBe(getDb());expect(getAuth()).not.toBe(getAuth());
 expect(mocks.pool.mock.calls.length).toBeGreaterThan(1);
 for(const [options] of mocks.pool.mock.calls)expect(options).toMatchObject({maxUses:1});
});
it('preserves the existing Node production singleton behavior',async()=>{
 vi.stubEnv('DEPLOYMENT_PLATFORM','vercel');vi.stubEnv('NODE_ENV','production');
 const {getDb}=await import('@/db'),{getAuth}=await import('@/lib/auth');
 expect(getDb()).toBe(getDb());expect(getAuth()).toBe(getAuth());
 expect(mocks.pool).toHaveBeenCalledTimes(1);expect(mocks.auth).toHaveBeenCalledTimes(1);
});

it('ignores only the known late close of an already removed Workers connection',async()=>{
 vi.stubEnv('DEPLOYMENT_PLATFORM','cloudflare');
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 const {getDb}=await import('@/db');getDb();
 const pool=mocks.instances[0],removed={},active={};
 pool.emit('remove',removed);
 pool.emit('error',new Error('This socket has been closed.'),removed);
 expect(log).not.toHaveBeenCalled();
 pool.emit('error',new Error('This socket has been closed.'),active);
 pool.emit('error',new Error('Different failure'),removed);
 expect(log).toHaveBeenCalledTimes(2);
 expect(log.mock.calls.flat().join('')).not.toContain('Different failure');
});
