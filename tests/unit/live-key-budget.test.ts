import {expect,it} from 'vitest';
import {assertApprovedKeyCap} from '../../evals/key-budget';
it('accepts the approved ceiling and lower rotation caps but never resetting or unbounded keys',()=>{
 for(const limit of [1,1.8,2])expect(assertApprovedKeyCap({limit,limit_reset:null,limit_remaining:.5},.2)).toBe(limit);
 for(const value of [
  {limit:3,limit_reset:null,limit_remaining:1},
  {limit:2,limit_reset:'daily',limit_remaining:1},
  {limit:null,limit_reset:null,limit_remaining:1},
  {limit:2,limit_reset:null,limit_remaining:NaN},
  {limit:2,limit_reset:null,limit_remaining:.1},
  {limit:1.8,limit_reset:null,limit_remaining:2},
 ])expect(()=>assertApprovedKeyCap(value,.2)).toThrow();
});
