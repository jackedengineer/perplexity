import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {afterAll,expect,it} from 'vitest';
import {recordMaintenance} from '@/server/operations/maintenance';
import * as schema from '@/db/schema';
const pg=new PGlite(),db=drizzle(pg,{schema});
afterAll(()=>pg.close());
it('records completion, rejects overlapping sweeps and never reports a failed sweep healthy',async()=>{
 await pg.exec('CREATE TABLE maintenance_status(name text primary key,started_at timestamptz not null,completed_at timestamptz,outcome text not null)');
 await recordMaintenance(db,async()=>{
  await expect(recordMaintenance(db,async()=>0)).rejects.toThrow('already running');
 });
 expect(await db.select().from(schema.maintenanceStatus)).toMatchObject([{outcome:'COMPLETED',completedAt:expect.any(Date)}]);
 await expect(recordMaintenance(db,async()=>{throw new Error('stage unavailable');})).rejects.toThrow('stage unavailable');
 expect(await db.select().from(schema.maintenanceStatus)).toMatchObject([{outcome:'FAILED',completedAt:null}]);
 await recordMaintenance(db,async()=>1);
 expect(await db.select().from(schema.maintenanceStatus)).toMatchObject([{outcome:'COMPLETED'}]);
});
