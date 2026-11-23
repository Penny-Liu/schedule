import {PERMISSIONS,UserRole,type User} from '../types';
const functionalPermissions=new Set<string>(Object.values(PERMISSIONS));
export function canReferenceStaffPermissions(actor:User,source:User):boolean {
 if(source.isActive===false)return false;
 if(actor.role===UserRole.SYSTEM_ADMIN)return true;
 if(!actor.permissions?.includes(PERMISSIONS.EDIT_STAFF)||source.role===UserRole.SYSTEM_ADMIN)return false;
 if(actor.role===UserRole.SUPERVISOR)return source.isRadiographer===true;
 if(actor.role===UserRole.HM_SUPERVISOR){
  return source.isHealthMgmt===true&&(!actor.healthMgmtLocation||actor.healthMgmtLocation==='全部'||source.healthMgmtLocation===actor.healthMgmtLocation);
 }
 return false;
}
export function previewStaffPermissionCopy(actor:User,source:User,current:string[]){
 if(!canReferenceStaffPermissions(actor,source))throw new Error('只能參考管理範圍內的人員權限。');
 const sourcePermissions=[...new Set(source.permissions||[])];
 const copied=sourcePermissions.filter(permission=>functionalPermissions.has(permission)&&(actor.role===UserRole.SYSTEM_ADMIN||actor.permissions?.includes(permission)));
 // Preserve non-functional flags (including developer sandbox) on the target.
 const permissions=[...new Set([...copied,...current.filter(permission=>!functionalPermissions.has(permission))])];
 return {permissions,copied,added:permissions.filter(p=>!current.includes(p)),removed:current.filter(p=>!permissions.includes(p)),excluded:sourcePermissions.filter(p=>!copied.includes(p))};
}
