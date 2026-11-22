import {describe,expect,it} from 'vitest';
import {LeaveType,LeaveStatus,UserRole,type LeaveRequest,type User} from '../types';
import {isRadiographerPreLeave,validatePreLeavePriority} from './preLeavePriority';
const user={id:'u',role:UserRole.RADIOGRAPHER_STAFF} as User;
const leave={id:'l',userId:'u',type:LeaveType.PRE_SCHEDULED,status:LeaveStatus.PENDING,startDate:'2026-12-01',endDate:'2026-12-01'} as LeaveRequest;
describe('manual pre-leave lottery priority',()=>{
 it('accepts positive ranks and clearing without changing approval or dates',()=>{
  const before={...leave};validatePreLeavePriority(leave,user,1,[leave]);validatePreLeavePriority(leave,user,null,[leave]);expect(leave).toEqual(before);
 });
 it.each([0,-1,1.5,1000,NaN])('rejects invalid rank %s',rank=>expect(()=>validatePreLeavePriority(leave,user,rank,[leave])).toThrow('整數'));
 it('rejects duplicate ranks on the same day but not on another day or rejected requests',()=>{
  const other={...leave,id:'other',preLeavePriority:1};
  expect(()=>validatePreLeavePriority(leave,user,1,[other])).toThrow('相同順位');
  expect(()=>validatePreLeavePriority(leave,user,1,[{...other,startDate:'2026-12-02'}])).not.toThrow();
  expect(()=>validatePreLeavePriority(leave,user,1,[{...other,status:LeaveStatus.REJECTED}])).not.toThrow();
 });
 it('does not annotate health management leave, long leave or multi-day requests',()=>{
  expect(isRadiographerPreLeave(leave,{...user,role:UserRole.HM_STAFF})).toBe(false);
  expect(isRadiographerPreLeave({...leave,type:LeaveType.LONG_LEAVE},user)).toBe(false);
  expect(()=>validatePreLeavePriority({...leave,endDate:'2026-12-02'},user,1,[])).toThrow('單日預假');
 });
});
