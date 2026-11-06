import {formatDurationCareNote} from './examDurationCareNote';
import type { DurationComparison } from './examDurationComparison';
import { workloadDurationDefinitions } from './workloadDurationGroups';
export type DurationSortKey = 'name'|'value'|'quantity'|'sampleCount'|'flowCount'|'coverage';
export type DurationSortDirection = 'asc'|'desc';
const nameCompare=(a:string,b:string)=>a.localeCompare(b,'zh-Hant');
const order=(field:string)=>workloadDurationDefinitions.findIndex(d=>d.key===field);
const numberCompare=(a:number|null|undefined,b:number|null|undefined,direction:DurationSortDirection)=>{
 if(a==null)return b==null?0:1;
 if(b==null)return -1;
 return (a-b)*(direction==='asc'?1:-1);
};
export function sortDurationRows(rows:DurationComparison[],key:DurationSortKey,direction:DurationSortDirection) {
 return [...rows].sort((a,b)=>key==='name'?order(a.fieldKey)-order(b.fieldKey):numberCompare(key==='value'&&!a.eligible?null:a[key],key==='value'&&!b.eligible?null:b[key],direction)||order(a.fieldKey)-order(b.fieldKey));
}
// 全科按同一檢查分類比較，避免把 MR 套別與 US 每醫令分鐘混在一起排序。
export function sortDurationPeople(rows:DurationComparison[],field:string,key:DurationSortKey,direction:DurationSortDirection) {
 return [...new Set(rows.map(r=>r.radiographer_name))].sort((a,b)=>{
  if(key==='name')return nameCompare(a,b)*(direction==='asc'?1:-1);
  const left=rows.find(r=>r.radiographer_name===a&&r.fieldKey===field);
  const right=rows.find(r=>r.radiographer_name===b&&r.fieldKey===field);
  return numberCompare(key==='value'&&!left?.eligible?null:left?.[key],key==='value'&&!right?.eligible?null:right?.[key],direction)||nameCompare(a,b);
 });
}
const fmt=(n:number|null|undefined)=>n==null?'—':n.toFixed(1);
export function formatExamDurationLineSummary({rows,period,filters,rankingRows=rows}:{rows:DurationComparison[];period:string;filters:string;rankingRows?:DurationComparison[]}) {
 const lines=['檢查耗時概況（依姓名排列）',`期間：${period}`];
 if(filters)lines.push(filters);
 const fields=workloadDurationDefinitions.filter(d=>rows.some(r=>r.fieldKey===d.key&&r.comparable));
 if(!fields.length)return '';
 for(const field of fields) {
  const peers=rankingRows.filter(r=>r.fieldKey===field.key&&r.comparable&&r.value!==null).sort((a,b)=>nameCompare(a.radiographer_name,b.radiographer_name));
  const selected=new Set(rows.filter(r=>r.fieldKey===field.key&&r.comparable).map(r=>r.key));
  const shown=peers.filter(r=>selected.has(r.key));
  if(!shown.length)continue;
   lines.push('',`${field.category}・${field.label}｜排程標準 ${new Set(shown.map(r=>r.standardMinutes)).size>1?'依各人檢查組合加權':`${fmt(shown[0].standardMinutes)}${shown[0].comparisonUnit}`}`);
  for(const r of shown) {
    const zone=r.durationZone==='slower'?'超出標準，建議了解':'標準時間內';
    lines.push(`・${r.radiographer_name} ${fmt(r.value)}分｜標準${fmt(r.standardMinutes)}分｜${zone}${formatDurationCareNote(r)?`｜${formatDurationCareNote(r)}`:''}`);
  }
 }
 return lines.join('\n');
}
