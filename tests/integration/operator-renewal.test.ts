import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
// @ts-expect-error Plain ESM helper without type declarations.
import {planDayWindows,renewOperatorWindow,renewalEnd} from '../../scripts/operator-renewal.mjs';
const pg=new PGlite(),key='renewal',hour=3600000,now=Date.parse('2026-11-06T04:30:00.000Z');
const iso=(value:string|number)=>new Date(value).toISOString();
const bucket=(kind:string,starts:string,ends:string,limit:bigint|number,reserved=0,settled=0)=>pg.query('INSERT INTO operator_usage_buckets(budget_key,kind,starts_at,ends_at,provider_limit_micro_usd,reserved_provider_micro_usd,settled_provider_micro_usd) VALUES ($1,$2,$3,$4,$5,$6,$7)',[key,kind,starts,ends,String(limit),reserved,settled]);
const rows=async()=>(await pg.query<Record<string,unknown>>('SELECT kind,starts_at,ends_at,provider_limit_micro_usd,reserved_provider_micro_usd,settled_provider_micro_usd FROM operator_usage_buckets WHERE budget_key=$1 ORDER BY kind,starts_at',[key])).rows;
const activeAt=async(time:number)=>(await pg.query<{kind:string;limit:string}>("SELECT kind,provider_limit_micro_usd::text AS limit FROM operator_usage_buckets WHERE budget_key=$1 AND starts_at<=$2 AND ends_at>$2",[key,iso(time)])).rows;
const renew=(endsAt:string,apply=true)=>renewOperatorWindow(pg,{budgetKey:key,endsAt:new Date(endsAt),apply,now});
// The production shape: a long first window, then whole UTC days to the end of the period.
const seedCalendarDays=async()=>{
 await bucket('PERIOD','2026-11-02T00:00:00.000Z','2026-11-12T13:55:00.001Z',1700000n,256742,39966);
 await bucket('DAY','2026-11-06T00:00:00.000Z','2026-11-07T00:00:00.000Z',1000000n,0,9302);
 for(const day of [7,8,9,10,11])await bucket('DAY',`2026-11-${String(day).padStart(2,'0')}T00:00:00.000Z`,`2026-11-${String(day+1).padStart(2,'0')}T00:00:00.000Z`,1000000n);
 await bucket('DAY','2026-11-12T00:00:00.000Z','2026-11-12T13:55:00.001Z',1000000n);
};
beforeAll(async()=>{const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));for(const entry of journal.entries)await pg.exec(await readFile(`drizzle/${entry.tag}.sql`,'utf8'));},60000);
beforeEach(async()=>{await pg.query('DELETE FROM operator_usage_buckets WHERE budget_key=$1',[key]);});
afterAll(()=>pg.close());
it('continues the calendar schedule: exactly one day and one period stay active throughout, at the same limit',async()=>{
 await seedCalendarDays();
 const result=await renew('2026-11-19T10:00:00.000Z');
 expect(result).toMatchObject({applied:true,dayWindowExtended:true,dayWindowsAdded:7,dayLimitMicroUsd:'1000000',periodCeilingMicroUsd:'1700000'});
 for(let time=now;time<Date.parse('2026-11-19T10:00:00.000Z');time+=hour){
  const active=await activeAt(time);
  expect(active.map(r=>r.kind).sort()).toEqual(['DAY','PERIOD']);expect(active.find(r=>r.kind==='DAY')?.limit).toBe('1000000');
 }
 expect(await activeAt(Date.parse('2026-11-19T10:00:00.000Z'))).toEqual([]);
});
it('preserves the ceiling, reservations and settled spend',async()=>{
 await seedCalendarDays();const money=async()=>(await rows()).filter(r=>r.kind==='PERIOD'||Number(r.settled_provider_micro_usd)>0).map(r=>[r.kind,r.provider_limit_micro_usd,r.reserved_provider_micro_usd,r.settled_provider_micro_usd]);
 const before=await money();await renew('2026-11-19T10:00:00.000Z');expect(await money()).toEqual(before);
});
it('a dry run reports the plan and changes nothing',async()=>{
 await seedCalendarDays();const before=await rows();
 expect(await renew('2026-11-19T10:00:00.000Z',false)).toMatchObject({applied:false,dayWindowsAdded:7});
 expect(await rows()).toEqual(before);
});
it('applying the same end again adds nothing',async()=>{
 await seedCalendarDays();await renew('2026-11-19T10:00:00.000Z');const before=await rows();
 expect(await renew('2026-11-19T10:00:00.000Z')).toMatchObject({dayWindowExtended:false,dayWindowsAdded:0});
 expect(await rows()).toEqual(before);
});
it('continues a rolling day window without overlap',async()=>{
 await bucket('PERIOD','2026-11-02T00:00:00.000Z','2026-11-08T00:00:00.000Z',1000000n);
 await bucket('DAY','2026-11-05T12:06:00.000Z','2026-11-06T12:06:00.000Z',400000n);
 await renew('2026-11-10T06:00:00.000Z');
 for(let time=now;time<Date.parse('2026-11-10T06:00:00.000Z');time+=hour)expect((await activeAt(time)).map(r=>r.kind).sort()).toEqual(['DAY','PERIOD']);
 expect((await activeAt(Date.parse('2026-11-09T01:00:00.000Z'))).find(r=>r.kind==='DAY')?.limit).toBe('400000');
});
it('keeps the approved day limit when renewing after the whole schedule has expired',async()=>{
 await bucket('PERIOD','2026-10-20T00:00:00.000Z','2026-11-05T13:55:00.000Z',1700000n,200000,40000);
 await bucket('DAY','2026-11-04T00:00:00.000Z','2026-11-05T00:00:00.000Z',550000n);
 await bucket('DAY','2026-11-05T00:00:00.000Z','2026-11-05T13:55:00.000Z',1000000n);
 expect(await renew('2026-11-09T06:00:00.000Z')).toMatchObject({dayLimitMicroUsd:'1000000',dayWindowExtended:false,dayWindowsAdded:4});
 expect(await activeAt(now-hour)).toEqual([]);
 for(let time=now;time<Date.parse('2026-11-09T06:00:00.000Z');time+=hour){
  const active=await activeAt(time);
  expect(active.map(r=>r.kind).sort()).toEqual(['DAY','PERIOD']);expect(active.find(r=>r.kind==='DAY')?.limit).toBe('1000000');
 }
});
it('uses the lower default only when no day window has ever existed',async()=>{
 await bucket('PERIOD','2026-11-02T00:00:00.000Z','2026-11-07T00:00:00.000Z',1700000n);
 expect(await renew('2026-11-08T00:00:00.000Z')).toMatchObject({dayLimitMicroUsd:'400000'});
});
it.each([
 ['an unreviewed ceiling',async()=>{await bucket('PERIOD','2026-11-02T00:00:00.000Z','2026-11-12T00:00:00.000Z',2500000n);},'2026-11-19T00:00:00.000Z',/ceiling/u],
 ['exhausted capacity',async()=>{await bucket('PERIOD','2026-11-02T00:00:00.000Z','2026-11-12T00:00:00.000Z',1700000n,1660000,0);},'2026-11-19T00:00:00.000Z',/Reconcile/u],
 ['a shorter period',async()=>{await bucket('PERIOD','2026-11-02T00:00:00.000Z','2026-11-12T00:00:00.000Z',1700000n);},'2026-11-10T00:00:00.000Z',/shorten/u],
 ['overlapping days',async()=>{await bucket('PERIOD','2026-11-02T00:00:00.000Z','2026-11-12T00:00:00.000Z',1700000n);await bucket('DAY','2026-11-06T00:00:00.000Z','2026-11-07T01:00:00.000Z',1000000n);await bucket('DAY','2026-11-07T00:00:00.000Z','2026-11-08T00:00:00.000Z',1000000n);},'2026-11-19T00:00:00.000Z',/Overlapping day/u],
])('refuses %s and changes nothing',async(_name,seed,endsAt,message)=>{
 await seed();const before=await rows();await expect(renew(endsAt)).rejects.toThrow(message);expect(await rows()).toEqual(before);
});
it('accepts capped non-resetting or daily keys and caps the period at seven days or the key expiry',()=>{
 const metadata=(change:Record<string,unknown>={})=>({limit:1,limit_reset:'daily',limit_remaining:.9,expires_at:'2027-01-01T00:00:00.000Z',...change});
 expect(renewalEnd(metadata(),now).getTime()).toBe(now+7*24*hour);
 expect(renewalEnd(metadata({limit_reset:null}),now).getTime()).toBe(now+7*24*hour);
 expect(renewalEnd(metadata({expires_at:'2026-11-08T00:00:00.000Z'}),now)).toEqual(new Date('2026-11-08T00:00:00.000Z'));
 for(const bad of [{limit:3},{limit:null},{limit_reset:'monthly'},{limit_remaining:.01}])expect(()=>renewalEnd(metadata(bad),now)).toThrow(/capped/u);
 for(const bad of [{expires_at:null},{expires_at:iso(now+1000)}])expect(()=>renewalEnd(metadata(bad),now)).toThrow(/expiry/u);
});
it('plans nothing when the schedule already reaches the end',()=>{
 expect(planDayWindows([{id:'a',starts_at:iso(now-hour),ends_at:iso(now+hour),provider_limit_micro_usd:'1000000'}],new Date(now+hour),now,400000n)).toEqual({extend:null,insert:[]});
});
