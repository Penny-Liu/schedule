import type {HealthMgmtShift,HealthMgmtStaff} from '../types';
import {HM_STAFF_SLOTS,healthMgmtDemandSlots,isHealthMgmtReportOnly,hasCurrentHealthMgmtCounts} from './healthMgmtLoadRules.mjs';
export type HealthMgmtCampus='北投'|'大直';
export interface HMLoadItem {name:string;category:string;kind:'mapped'|'unmapped'|'report';key:string|null;order_count:number;}
export interface HMLoadSnapshot {exam_date:string;location:string;counts:Record<string,number>;customer_count:number;source_count:number;unmapped_count:number;missing_identity_count:number;fallback_identity_count:number;items:HMLoadItem[];algorithm:string;synced_at:string;}
export interface HMHSupportShift {id?:string;date:string;location?:string;staff_names?:string;category?:string;task?:string;}
// Existing snapshots already excluded report orders from demand; update annotations only.
export function normalizeHealthMgmtReportOrders(snapshot:HMLoadSnapshot):HMLoadSnapshot {
 const removed=snapshot.items.filter(item=>item.kind==='unmapped'&&isHealthMgmtReportOnly(item.name)).reduce((sum,item)=>sum+item.order_count,0);
 return {...snapshot,unmapped_count:Math.max(0,snapshot.unmapped_count-removed),items:snapshot.items.map(item=>isHealthMgmtReportOnly(item.name)?{...item,kind:'report',key:null}:item)};
}
export interface HMLoadSyncDay {exam_date:string;algorithm:string;synced_at:string;}
export const isHealthMgmtSnapshotReady=(snapshot:HMLoadSnapshot|undefined,day:HMLoadSyncDay|undefined)=>Boolean(snapshot&&day&&hasCurrentHealthMgmtCounts(snapshot.counts)&&snapshot.algorithm===day.algorithm&&Date.parse(snapshot.synced_at)===Date.parse(day.synced_at));
export function hmCapacityStation(station:string){
 const text=String(station||'').trim();
 const base=text.split(/[\s,]+/).find(p=>!p.includes(':'))||text;
 if(/^HA($|[^A-Z])/.test(base)||base==='醫務助理')return 'HA';
 if(/^H($|[^A-Z])/.test(base)||['健管','接待'].includes(base))return 'H';
 return null;
}
export function calculateHealthMgmtCapacity(date:string,location:HealthMgmtCampus,shifts:HealthMgmtShift[],staff:HealthMgmtStaff[],supportShifts:HMHSupportShift[]=[]){
 const supportIds=new Set<string>(),supportPending=new Map<string,{id:string;name:string;reason:string}>(),expanded=[...shifts];
 const normalize=(name:string)=>name.trim().replace(/\s+/g,'');
 for(const support of supportShifts.filter(s=>s.date===date&&(!s.category||s.category==='H班'))){
  for(const text of String(support.staff_names||'').split(/[,，、;；\n]+/)){
   const name=text.trim();if(!name)continue;
   const matches=staff.filter(person=>[person.name,person.alias||''].some(value=>value&&normalize(value)===normalize(name)));
   if(matches.length!==1){if(!support.location||support.location===location||!['北投','大直'].includes(support.location)){const id=`support:${normalize(name)}`;supportPending.set(id,{id,name,reason:matches.length?'H 支援姓名對應不明（同名／別名重複），待確認':'H 支援姓名未對應健管人員，待確認'});}continue;}
   const person=matches[0];supportIds.add(person.id);expanded.push({id:`support:${support.id||''}:${person.id}`,userId:person.id,date:support.date,station:'H',location:support.location||'未指定',task:support.task});
  }
 }
 const included:{id:string;name:string;station:string}[]=[],excluded:{id:string;name:string;reason:string}[]=[];
 const groups=new Map<string,HealthMgmtShift[]>();
 for(const shift of expanded.filter(s=>s.date===date)){const rows=groups.get(shift.userId)||[];rows.push(shift);groups.set(shift.userId,rows);}
 for(const [id,rows]of groups){
  const member=staff.find(s=>s.id===id),name=member?.name||'未對應人員';
  const campus=(s:HealthMgmtShift)=>s.location||(['北投','大直'].includes(member?.location||'')?member!.location:'未指定');
  const relevant=rows.filter(s=>hmCapacityStation(s.station));
  if(!relevant.length){if(rows.some(s=>campus(s)===location&&/行政|場控|主控/.test([s.station,s.task,...s.specialRoles||[]].join(' '))))excluded.push({id,name,reason:'行政／場控／主控不列入'});continue;}
  const own=relevant.filter(s=>campus(s)===location);
  const unknown=relevant.filter(s=>!['北投','大直'].includes(campus(s)));
  if(!own.length){if(unknown.length)excluded.push({id,name,reason:'H／HA 未指定院區，暫不分配人力'});continue;}
  let reason='';
  if(!member)reason='排班未對應人員';
  else if(member.hireDate&&date<member.hireDate)reason='尚未到職';
  else if(member.terminationDate&&date>member.terminationDate)reason='已離職';
  else if(!member.isActive&&!member.terminationDate)reason='人員已停用';
  else if(relevant.some(s=>campus(s)!==location))reason='同日跨院區排班，待確認人力分配';
  else if(rows.some(s=>/行政|場控|主控/.test([s.station,s.task,...s.specialRoles||[]].join(' '))))reason='行政／場控／主控不列入';
  if(reason)excluded.push({id,name,reason});else included.push({id,name,station:hmCapacityStation(own[0].station)!+(supportIds.has(id)?'・H支援':'')});
 }
 excluded.push(...supportPending.values());
 return {included,excluded,staffCount:included.length,supplySlots:included.length*HM_STAFF_SLOTS};
}
export function calculateHealthMgmtLoad(snapshot:HMLoadSnapshot|undefined,synced:boolean,capacity:ReturnType<typeof calculateHealthMgmtCapacity>){
 const demand=synced?healthMgmtDemandSlots(snapshot?.counts||{}):null;
 const rate=demand===null||capacity.supplySlots===0?null:demand/capacity.supplySlots*100;
 const unresolved=Boolean(snapshot&&(snapshot.unmapped_count||snapshot.missing_identity_count||snapshot.fallback_identity_count));
 const unknownCapacity=capacity.excluded.some(e=>/未指定|跨院區|未對應|對應不明|名單未就緒/.test(e.reason));
 const status=demand===null?'尚未同步':unknownCapacity?'人力待確認':demand>0&&capacity.staffCount===0?'無可用人力':unresolved?'資料待確認':rate===null?'-':rate<75?'綠區':rate<=90?'黃區':'紅區';
 return {...capacity,demand,rate,status,unresolved,unknownCapacity,remainingSlots:demand===null?null:capacity.supplySlots-demand,additionalStaff:demand===null?null:Math.max(0,Math.ceil(demand/HM_STAFF_SLOTS)-capacity.staffCount)};
}
