import {describe,expect,it} from 'vitest';
import {UserRole,PERMISSIONS as P,type User,type HealthMgmtStaff,type RosterCycle} from '../types';
import {canViewHMCampus,canEditHMCampus,canManageHMStaff,effectiveHMCycle,hmCampusCycles,validateHMCycleRange,hmCycleDates,resolveHMDefaultCycle,type HMPersonalCycle} from './healthMgmtPersonalCycles';
import {calculateHMCycleStatistics} from './healthMgmtCycleStatistics';
const north={id:'n',name:'第11週期',location:'北投',startDate:'2026-11-03',endDate:'2026-12-01'} as RosterCycle;
const south={...north,id:'s',location:'大直',startDate:'2026-11-01'} as RosterCycle;
const staff={id:'u',name:'測試',isActive:true,location:'北投'} as HealthMgmtStaff;
const user={role:UserRole.HM_SUPERVISOR,healthMgmtLocation:'北投',permissions:[P.VIEW_HEALTH_MGMT,P.EDIT_HEALTH_MGMT]} as User;
const custom={staff_id:'u',campus:'北投',cycle_id:'n',start_date:'2026-11-02',end_date:'2026-11-04',memo:'個人調整'} as HMPersonalCycle;
describe('campus-specific health management cycles',()=>{
 it('keeps identical cycle names separated by campus and cycle id',()=>{
  expect(hmCampusCycles([north,south],'北投')).toEqual([north]);
  expect(effectiveHMCycle(staff,north,'北投',[{...custom,campus:'大直'}, {...custom,cycle_id:'s'}]).customized).toBe(false);
  expect(()=>effectiveHMCycle(staff,south,'北投',[])).toThrow('週期不屬於');
 });
 it('resolves Chinese named cycles before overlapping dates and keeps campuses separate',()=>{
  const next={...north,id:'next',name:'第12週期',startDate:'2026-11-30',endDate:'2026-12-31'};
  const named={...north,name:'2026第十一週期'};
  expect(resolveHMDefaultCycle([next,south,named],'北投','2026-11','2026-11-30')?.id).toBe('n');
  expect(resolveHMDefaultCycle([next,south,named],'大直','2026-11','2026-11-30')?.id).toBe('s');
 });
 it('inherits default dates, applies personal dates and restores defaults when removed',()=>{
  expect(effectiveHMCycle(staff,north,'北投',[]).startDate).toBe('2026-11-03');
  expect(effectiveHMCycle(staff,north,'北投',[custom])).toMatchObject({startDate:'2026-11-02',endDate:'2026-11-04',memo:'個人調整',customized:true});
  expect(effectiveHMCycle(staff,north,'北投',[]).endDate).toBe('2026-12-01');
 });
 it('limits views and edits to assigned campus and explicit edit permissions',()=>{
  expect(canViewHMCampus(user,'北投')).toBe(true);expect(canEditHMCampus(user,'北投')).toBe(true);
  expect(canViewHMCampus(user,'大直')).toBe(false);expect(canEditHMCampus(user,'大直')).toBe(false);
  expect(canEditHMCampus({...user,permissions:[P.VIEW_HEALTH_MGMT]},'北投')).toBe(false);
  expect(canEditHMCampus({...user,role:UserRole.SYSTEM_ADMIN},'大直')).toBe(true);
  expect(canViewHMCampus({role:UserRole.VIEWER} as User,'北投')).toBe(false);
 });
 it('rejects impossible, reversed and oversized dates and counts inclusive dates',()=>{
  expect(()=>validateHMCycleRange('2026-02-30','2026-03-01')).toThrow();
  expect(()=>validateHMCycleRange('2026-12-01','2026-11-01')).toThrow();
  expect(()=>validateHMCycleRange('2025-01-01','2026-12-01')).toThrow();
  expect(hmCycleDates('2026-12-31','2027-01-02')).toEqual(['2026-12-31','2027-01-01','2027-01-02']);
 });
 it('calculates personal statistics from the override and excludes other campuses',()=>{
  const shifts=[{id:'a',userId:'u',date:'2026-11-02',station:'07:30-15:30 H',location:'北投',task:'輔控'}, {id:'b',userId:'u',date:'2026-11-03',station:'H',location:'大直'}, {id:'c',userId:'u',date:'2026-11-04',station:'H',location:'北投'}, {id:'d',userId:'u',date:'2026-11-05',station:'H',location:'北投'}];
  const result=calculateHMCycleStatistics([staff],shifts,['H'],[],hmCycleDates(north.startDate,north.endDate),'北投',north,[custom])[0];
  expect(result.total).toBe(2);expect(result.counts.H).toBe(2);expect(result.roleCounts['輔控']).toBe(1);expect(result.effective.memo).toBe('個人調整');
  const hired=calculateHMCycleStatistics([{...staff,hireDate:'2026-11-03',terminationDate:'2026-11-04'}],shifts,['H'],[],[], '北投',north,[custom])[0];
  expect(hired.total).toBe(1);
 });
 it('counts visiting staff only at their actual support campus and does not use foreign personal notes',()=>{
  const visitor={...staff,location:'大直'};
  const shifts=[{id:'a',userId:'u',date:'2026-11-03',station:'H',location:'北投'},{id:'b',userId:'u',date:'2026-11-04',station:'H',location:'大直'}];
  const result=calculateHMCycleStatistics([visitor],shifts,['H'],[],[], '北投',north,[{...custom,campus:'大直',memo:'foreign note'}])[0];
  expect(result.total).toBe(1);expect(result.effective.memo).not.toBe('foreign note');
  expect(canManageHMStaff(user,visitor)).toBe(false);
  expect(canManageHMStaff(user,{...staff,location:'全部'})).toBe(false);
  expect(canManageHMStaff({...user,healthMgmtLocation:'全部'},{...staff,location:'全部'})).toBe(true);
 });

});
