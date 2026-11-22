import {UserRole,type User} from '../types';
export function matchesStaffDirectory(user:User, filters:{search:string;department:string;campus:string;role:string}):boolean {
 const search=filters.search.trim().toLocaleLowerCase();
 if(search&&![user.name,user.username,user.alias].some(value=>value?.toLocaleLowerCase().includes(search)))return false;
 const hm=!!user.isHealthMgmt||[UserRole.HM_STAFF,UserRole.HM_SUPERVISOR].includes(user.role);
 const radio=!!user.isRadiographer||[UserRole.RADIOGRAPHER_STAFF,UserRole.RADIOGRAPHER_ASSISTANT,UserRole.SUPERVISOR].includes(user.role);
 if(filters.department==='健管'&&!hm||filters.department==='放射師'&&!radio||filters.department==='其他'&&(hm||radio))return false;
 if(filters.role!=='全部'&&user.role!==filters.role)return false;
 if(filters.campus!=='全部'){
  if(!hm)return false;
  if((user.healthMgmtLocation||'全部')!==(filters.campus==='跨院'?'全部':filters.campus))return false;
 }
 return true;
}
