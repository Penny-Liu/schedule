import {PERMISSIONS,UserRole,type User,type HealthMgmtStaff,type RosterCycle} from '../types';
export type HMCampus='北投'|'大直';
export type HMPersonalCycle={staff_id:string;campus:HMCampus;cycle_id:string;start_date:string;end_date:string;memo:string;updated_at?:string;updated_by?:string};
export function canViewHMCampus(user:User,campus:HMCampus):boolean{
 const view=user.role===UserRole.SYSTEM_ADMIN||[UserRole.HM_SUPERVISOR,UserRole.HM_STAFF].includes(user.role)||user.permissions?.includes(PERMISSIONS.VIEW_HEALTH_MGMT);
 return !!view&&(user.role===UserRole.SYSTEM_ADMIN||!user.healthMgmtLocation||user.healthMgmtLocation==='全部'||user.healthMgmtLocation===campus);
}
export function canEditHMCampus(user:User,campus:HMCampus):boolean{
 return canViewHMCampus(user,campus)&&(user.role===UserRole.SYSTEM_ADMIN||!!user.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT));
}
export function hmCampusCycles(cycles:RosterCycle[],campus:HMCampus):RosterCycle[]{return cycles.filter(c=>c.location===campus);}
export function validateHMCycleRange(start:string,end:string,memo=''):void{
 for(const value of [start,end]){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw new Error('請填寫有效的週期日期');
 }
 if(end<start||Date.parse(end)-Date.parse(start)>366*86400000)throw new Error('週期結束日不可早於開始日，範圍最多367天');
 if(memo.length>500)throw new Error('備註最多500字');
}
export function hmCycleDates(start:string,end:string):string[]{
 validateHMCycleRange(start,end);const result:string[]=[];
 for(let stamp=Date.parse(start);stamp<=Date.parse(end);stamp+=86400000)result.push(new Date(stamp).toISOString().slice(0,10));
 return result;
}
export function effectiveHMCycle(staff:HealthMgmtStaff,cycle:RosterCycle,campus:HMCampus,overrides:HMPersonalCycle[]){
 if(cycle.location!==campus)throw new Error('週期不屬於目前院區');
 if(staff.location&&staff.location!=='全部'&&staff.location!==campus)throw new Error('人員不屬於目前院區');
 const saved=overrides.find(p=>p.staff_id===staff.id&&p.campus===campus&&p.cycle_id===cycle.id);
 const startDate=saved?.start_date||cycle.startDate,endDate=saved?.end_date||cycle.endDate;
 return {startDate,endDate,memo:saved?.memo||'',customized:!!saved,dates:hmCycleDates(startDate,endDate)};
}
export function resolveHMDefaultCycle(cycles:RosterCycle[],campus:HMCampus,yearMonth:string,anchorDate?:string):RosterCycle|undefined{
 const choices=hmCampusCycles(cycles,campus);
 const chinese:Record<string,number>={一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,十一:11,十二:12};
 const named=choices.find(c=>{
  const slash=c.name.trim().match(/^(\d{4})\/(\d{1,2})$/);
  if(slash)return `${slash[1]}-${slash[2].padStart(2,'0')}`===yearMonth;
  const match=c.name.trim().match(/^(?:(\d{4})年?)?第([\d一二三四五六七八九十]+)週期$/);
  if(!match)return false;
  const number=Number(match[2])||chinese[match[2]];
  const year=match[1]?Number(match[1]):Number(c.startDate.slice(0,4))+(number===1&&c.startDate.slice(5,7)==='12'?1:0);
  return `${year}-${String(number).padStart(2,'0')}`===yearMonth;
 });
 return named||choices.find(c=>!!anchorDate&&c.startDate<=anchorDate&&c.endDate>=anchorDate)||choices.find(c=>c.startDate.startsWith(yearMonth));
}
export function canManageHMStaff(user:User,staff:HealthMgmtStaff):boolean{
 if(user.role===UserRole.SYSTEM_ADMIN)return true;
 if(!staff.location||staff.location==='全部')return (!user.healthMgmtLocation||user.healthMgmtLocation==='全部')&&!!user.permissions?.includes(PERMISSIONS.EDIT_HEALTH_MGMT);
 return (staff.location==='北投'||staff.location==='大直')&&canEditHMCampus(user,staff.location);
}
