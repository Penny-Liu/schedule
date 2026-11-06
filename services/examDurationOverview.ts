import {formatDurationCareNote} from './examDurationCareNote';
import type { DurationComparison } from './examDurationComparison';
import { workloadDurationDefinitions } from './workloadDurationGroups';
export type DurationWorkState='normal'|'attention'|'observe'|'data';
export const durationWorkLabels:Record<DurationWorkState,string>={normal:'標準時間內',attention:'超出標準，建議了解',observe:'持續觀察',data:'資料待補'};
export function getDurationWorkState(row:DurationComparison):DurationWorkState {
 if(!row.eligible||row.value===null)return 'data';
 if(row.coverage<0.8||row.standardMinutes===null)return 'data';
 if(row.flowCount<2||!row.comparable)return 'observe';
 if(row.durationZone==='slower')return 'attention';
 return 'normal';
}
export function buildDurationOverview(rows:DurationComparison[]) {
 rows=rows.filter(r=>Boolean(r.radiographer_id));
 const names=[...new Set(rows.map(r=>r.radiographer_name))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 return names.map(name=>{
  const items=rows.filter(r=>r.radiographer_name===name).sort((a,b)=>workloadDurationDefinitions.findIndex(d=>d.key===a.fieldKey)-workloadDurationDefinitions.findIndex(d=>d.key===b.fieldKey));
  const states=Object.fromEntries((Object.keys(durationWorkLabels) as DurationWorkState[]).map(state=>[state,items.filter(r=>getDurationWorkState(r)===state)])) as Record<DurationWorkState,DurationComparison[]>;
  return {name,items,states};
 });
}
export function formatDurationOverviewReport(rows:DurationComparison[],period:string,filters:string) {
 const people=buildDurationOverview(rows);
 if(!people.length)return '';
 const attention=people.filter(p=>p.states.attention.length).length;
 const within=people.filter(p=>p.states.normal.length).length;
 const lines=['放射師作業概況',`期間：${period}`,filters,`本期 ${people.length} 人｜有建議了解項目 ${attention} 人｜有標準時間內項目 ${within} 人`,'以提供的排程標準比較，品質尚未串接，本報告僅反映耗時；依姓名排列，無快慢排名。'];
 for(const person of people) {
  lines.push('',person.name);
  for(const state of ['attention','normal','observe','data'] as DurationWorkState[]){
   const items=person.states[state];
   if(!items.length)continue;
   lines.push(`${durationWorkLabels[state]}：${items.map(r=>`${r.category}・${r.label}${r.value===null?'':` ${r.value.toFixed(1)}${r.comparisonUnit}／標準${r.standardMinutes==null?'待設定':r.standardMinutes.toFixed(1)}`}${formatDurationCareNote(r)?`（${formatDurationCareNote(r)}）`:''}`).join('、')}`);
  }
 }
 lines.push('','建議了解項目可先核對個案難度、設備、等待與支援情形，再安排協助；標準內項目仍需搭配品質確認。');
 return lines.filter(line=>line!==undefined).join('\n');
}
