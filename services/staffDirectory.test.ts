import {describe,expect,it} from 'vitest';
import {UserRole,type User} from '../types';
import {matchesStaffDirectory} from './staffDirectory';
const all={search:'',department:'全部',campus:'全部',role:'全部'};
const staff={name:'測試健管師',username:'hm-tester',alias:'測',role:UserRole.HM_STAFF,healthMgmtLocation:'大直',isHealthMgmt:true} as User;
describe('staff directory filters',()=>{
 it('combines search, department, campus and role',()=>{
  expect(matchesStaffDirectory(staff,{search:'HM-TEST',department:'健管',campus:'大直',role:UserRole.HM_STAFF})).toBe(true);
  expect(matchesStaffDirectory(staff,{...all,campus:'北投'})).toBe(false);
  expect(matchesStaffDirectory(staff,{...all,role:UserRole.HM_SUPERVISOR})).toBe(false);
 });
 it('recognizes legacy role flags and keeps cross-campus distinct',()=>{
  const legacy={...staff,isHealthMgmt:false,healthMgmtLocation:undefined};
  expect(matchesStaffDirectory(legacy,{...all,department:'健管',campus:'跨院'})).toBe(true);
  expect(matchesStaffDirectory(legacy,{...all,campus:'大直'})).toBe(false);
 });
 it('does not label non-health-management accounts as cross-campus',()=>{
  const radio={...staff,isHealthMgmt:false,role:UserRole.RADIOGRAPHER_STAFF};
  expect(matchesStaffDirectory(radio,{...all,department:'放射師'})).toBe(true);
  expect(matchesStaffDirectory(radio,{...all,campus:'跨院'})).toBe(false);
  expect(matchesStaffDirectory(staff,{...all,search:'不存在'})).toBe(false);
 });
});
