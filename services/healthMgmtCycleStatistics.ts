import type {HealthMgmtStaff,HealthMgmtShift,Holiday,RosterCycle} from '../types';
import {effectiveHMCycle,hmCycleDates,type HMCampus,type HMPersonalCycle} from './healthMgmtPersonalCycles';
export function calculateHMCycleStatistics(staff:HealthMgmtStaff[],shifts:HealthMgmtShift[],stations:string[],holidays:Holiday[],dates:string[],campus:string,cycle:RosterCycle|undefined,overrides:HMPersonalCycle[]){
 return staff.map(person=>{
  const home=!person.location||person.location==='全部'||person.location===campus;
  const effective=cycle&&(campus==='北投'||campus==='大直')?(home?effectiveHMCycle(person,cycle,campus as HMCampus,overrides):{startDate:cycle.startDate,endDate:cycle.endDate,memo:'支援人員，沿用本院預設',customized:false,dates:hmCycleDates(cycle.startDate,cycle.endDate)}):{dates,startDate:dates[0]||'',endDate:dates.at(-1)||'',memo:'',customized:false};
  const counts:Record<string,number>={},roleCounts:Record<string,number>={主控:0,輔控:0,晚班:0,call班:0,排班:0};let total=0,weekday=0,holidayCount=0;
  const workingDates=effective.dates.filter(date=>(!person.hireDate||date>=person.hireDate)&&(!person.terminationDate||date<=person.terminationDate));
  for(const date of workingDates){
   const shift=shifts.find(s=>s.userId===person.id&&s.date===date&&(campus==='全部'||(s.location||person.location)===campus));
   if(!shift)continue;
   const raw=shift.station||'',parts=raw.split(' ');
   const station=parts.length>1&&parts[0].includes(':')?parts.slice(1).join(' '):raw;
   if(station&&station!=='假'){
    total++;const day=new Date(date+'T12:00:00').getDay();
    if(day===0||day===6||holidays.some(h=>h.date===date&&(h.type==='NATIONAL'||h.type==='CLOSED')))holidayCount++;else weekday++;
    if(stations.includes(station))counts[station]=(counts[station]||0)+1;
   }
   const text=`${shift.station} ${shift.task||''}`;
   for(const role of Object.keys(roleCounts))if(text.includes(role))roleCounts[role]++;
  }
  return {staff:person,counts,total,weekday,holidayCount,roleCounts,effective};
 });
}
