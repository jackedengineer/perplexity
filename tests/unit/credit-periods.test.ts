import {expect,it} from 'vitest';
import {freeWindows} from '@/server/billing/periods';
it('resets free grants at Kolkata midnight and calendar month boundaries',()=>{
 const before=freeWindows(new Date('2026-10-31T18:29:59Z'));
 expect(before.period.endsAt.toISOString()).toBe('2026-10-31T18:30:00.000Z');
 const after=freeWindows(new Date('2026-10-31T18:30:00Z'));
 expect(after.period.startsAt.toISOString()).toBe('2026-10-31T18:30:00.000Z');
 expect(after.period.endsAt.toISOString()).toBe('2026-11-30T18:30:00.000Z');
 expect(after.day.startsAt).toEqual(after.period.startsAt);
 expect(after.day.endsAt.toISOString()).toBe('2026-11-01T18:30:00.000Z');
});
