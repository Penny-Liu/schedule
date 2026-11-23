import {describe,expect,it} from 'vitest';
import {UserRole,PERMISSIONS as P,type User} from '../types';
import {canReferenceStaffPermissions,previewStaffPermissionCopy} from './staffPermissionCopy';
const admin={role:UserRole.SYSTEM_ADMIN} as User;
const source={id:'source',name:'參考人員',role:UserRole.HM_SUPERVISOR,isActive:true,isHealthMgmt:true,healthMgmtLocation:'北投',permissions:[P.VIEW_HEALTH_MGMT,P.EDIT_HEALTH_MGMT,'developer_sandbox']} as User;
const hm={role:UserRole.HM_SUPERVISOR,healthMgmtLocation:'北投',permissions:[P.EDIT_STAFF,P.VIEW_HEALTH_MGMT]} as User;
describe('permission copy preview',()=>{
 it('copies functional permissions, preserves target sandbox and does not mutate source or target',()=>{
  const current=[P.VIEW_PHYSICIAN,'developer_sandbox'];
  const original=[...source.permissions!];
  const result=previewStaffPermissionCopy(admin,source,current);
  expect(result.permissions).toEqual([P.VIEW_HEALTH_MGMT,P.EDIT_HEALTH_MGMT,'developer_sandbox']);
  expect(result.added).toEqual([P.VIEW_HEALTH_MGMT,P.EDIT_HEALTH_MGMT]);
  expect(result.removed).toEqual([P.VIEW_PHYSICIAN]);
  expect(result.excluded).toEqual(['developer_sandbox']);
  expect(source.permissions).toEqual(original);expect(current).toEqual([P.VIEW_PHYSICIAN,'developer_sandbox']);
 });
 it('does not enable sandbox on a target without it',()=>{
  expect(previewStaffPermissionCopy(admin,source,[]).permissions).not.toContain('developer_sandbox');
 });
 it('limits supervisors to permissions they already hold',()=>{
  const result=previewStaffPermissionCopy(hm,source,[]);
  expect(result.permissions).toEqual([P.VIEW_HEALTH_MGMT]);
  expect(result.excluded).toContain(P.EDIT_HEALTH_MGMT);
 });
 it('rejects other campuses, other departments and system administrator sources',()=>{
  for(const user of [{...source,healthMgmtLocation:'大直'},{...source,isHealthMgmt:false},{...source,role:UserRole.SYSTEM_ADMIN}] as User[]){
   expect(canReferenceStaffPermissions(hm,user)).toBe(false);
   expect(()=>previewStaffPermissionCopy(hm,user,[])).toThrow('管理範圍');
  }
 });
 it('allows cross-campus managers and restricts radiographer supervisors to their department',()=>{
  expect(canReferenceStaffPermissions({...hm,healthMgmtLocation:'全部'}, {...source,healthMgmtLocation:'大直'})).toBe(true);
  const radio={...hm,role:UserRole.SUPERVISOR};
  expect(canReferenceStaffPermissions(radio,source)).toBe(false);
  expect(canReferenceStaffPermissions(radio,{...source,isRadiographer:true})).toBe(true);
 });
 it('does not permit viewers, inactive sources or unknown functional permissions',()=>{
  expect(canReferenceStaffPermissions({role:UserRole.VIEWER} as User,source)).toBe(false);
  expect(canReferenceStaffPermissions(admin,{...source,isActive:false})).toBe(false);
  const result=previewStaffPermissionCopy(admin,{...source,permissions:['invented_permission',P.VIEW_HEALTH_MGMT]},['target_flag']);
  expect(result.permissions).toEqual([P.VIEW_HEALTH_MGMT,'target_flag']);
 });
 it('deduplicates permissions and supports explicitly removing all functional permissions',()=>{
  expect(previewStaffPermissionCopy(admin,{...source,permissions:[P.VIEW_HEALTH_MGMT,P.VIEW_HEALTH_MGMT]},[]).permissions).toEqual([P.VIEW_HEALTH_MGMT]);
  expect(previewStaffPermissionCopy(admin,{...source,permissions:[]},[P.VIEW_HEALTH_MGMT]).removed).toEqual([P.VIEW_HEALTH_MGMT]);
 });
});
