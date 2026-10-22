import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import * as schema from '@/db/schema';
import {createRequestLimiter,requestRateKey} from '@/server/runs/rate-limit';

const pg=new PGlite(),db=drizzle(pg,{schema});
const policy={userMinute:2,userDay:3,anonymousMinute:1,anonymousDay:2};
beforeAll(async()=>{const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const e of journal.entries)await pg.exec(await readFile(`drizzle/${e.tag}.sql`,'utf8'));});
beforeEach(()=>db.delete(schema.requestRateBuckets));
afterAll(()=>pg.close());
it('shares a saturating allowance across limiter instances and retains denials',async()=>{
 const a=createRequestLimiter(db,'test-rates',policy),b=createRequestLimiter(db,'test-rates',policy);
 await a.consume('alice');await b.consume('alice');
 await expect(a.consume('alice')).rejects.toMatchObject({code:'RATE_LIMITED'});
 await expect(b.consume('alice')).rejects.toMatchObject({code:'RATE_LIMITED'});
 const rows=await db.select().from(schema.requestRateBuckets);
 expect(rows.find(r=>r.kind==='MINUTE')?.attempts).toBe(2);
 expect(rows.find(r=>r.kind==='DAY')?.attempts).toBe(3);
});
it('a new session, body or spoofed client identity cannot reset the verified subject key',async()=>{
 const service=createRequestLimiter(db,'test-rates',policy);await service.consume('alice');await service.consume('alice');
 await expect(createRequestLimiter(db,'test-rates',policy).consume('alice')).rejects.toMatchObject({code:'RATE_LIMITED'});
 await expect(service.consume('bob')).resolves.toBeUndefined();
 expect(requestRateKey('alice','test-rates')).not.toContain('alice');
 expect(requestRateKey('alice','other-service')).toBe(requestRateKey('alice','test-rates'));
});
it('anonymous denials share one bounded bucket without spending signed-in allocation',async()=>{
 const service=createRequestLimiter(db,'test-rates',policy);await service.consume(null);
 await expect(service.consume(null)).rejects.toMatchObject({code:'RATE_LIMITED'});
 await service.consume('alice');
 expect(await db.select().from(schema.requestRateBuckets)).toHaveLength(4);
});
it('expired minute rows do not reset the remaining daily allocation',async()=>{
 const service=createRequestLimiter(db,'test-rates',policy);await service.consume('alice');await service.consume('alice');
 await db.delete(schema.requestRateBuckets).where(eq(schema.requestRateBuckets.kind,'MINUTE'));
 await service.consume('alice');await expect(service.consume('alice')).rejects.toMatchObject({code:'RATE_LIMITED'});
 expect((await db.select().from(schema.requestRateBuckets).where(eq(schema.requestRateBuckets.kind,'DAY')))[0].attempts).toBe(3);
});
it('rejects malformed server policy without touching any counters',()=>{
 expect(()=>createRequestLimiter(db,'test-rates',{...policy,userMinute:0})).toThrow();
 expect(()=>createRequestLimiter(db,'unsafe namespace',policy)).toThrow();
});
