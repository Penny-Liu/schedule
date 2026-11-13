import {it,expect} from 'vitest';
import {defaultHealthMgmtSyncRange} from './healthMgmtSyncRange.mjs';
it('includes today through day 14, across month/year and leap-day boundaries',()=>{
 for(const [from,to]of [['2026-11-13','2026-11-27'],['2026-12-25','2027-01-08'],['2028-02-20','2028-03-05']]){
  const range=defaultHealthMgmtSyncRange(from);expect(range).toEqual({from,to});expect((Date.parse(to)-Date.parse(from))/86400000+1).toBe(15);
 }
 expect(()=>defaultHealthMgmtSyncRange('2026-02-30')).toThrow();
});
