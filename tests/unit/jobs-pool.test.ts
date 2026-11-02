import {EventEmitter} from 'node:events';
import {afterAll,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({options:{} as Record<string,unknown>,pool:undefined as unknown}));
vi.mock('pg',()=>({Pool:class extends EventEmitter{constructor(options:Record<string,unknown>){super();mocks.options=options;mocks.pool=this;}async end(){}}}));
vi.mock('drizzle-orm/node-postgres',()=>({drizzle:()=>({})}));
import {workerDatabase,closeWorkerDatabase} from '@/server/jobs/connection';
afterAll(async()=>{await closeWorkerDatabase();vi.unstubAllEnvs();});
it('bounds stalled queries and absorbs idle socket errors without serializing credentials',()=>{
 vi.stubEnv('DATABASE_URL','postgresql://perplex_web:private@ep-sweet-night-az8bacv2-pooler.c-3.ap-southeast-1.aws.neon.tech/perplex?sslmode=verify-full');vi.stubEnv('JOB_DATABASE_URL','');
 vi.stubEnv('ENABLE_DURABLE_JOB_SANDBOX','true');vi.stubEnv('VERCEL_ENV','development');vi.stubEnv('JOB_DATABASE_URL',process.env.DATABASE_URL!);
 vi.stubEnv('JOB_OPERATOR_BUDGET_KEY','test-pool');
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
 try{workerDatabase();expect(mocks.options.query_timeout).toBe(10000);expect(mocks.options.connectionTimeoutMillis).toBe(5000);expect(mocks.options.keepAlive).toBe(true);
  expect(()=>(mocks.pool as EventEmitter).emit('error',Object.assign(new Error('private'),{client:{password:'private'}}))).not.toThrow();
  expect(warn).toHaveBeenCalledWith('{"event":"jobs.database_pool","outcome":"UNAVAILABLE"}');
 }finally{warn.mockRestore();}
});
