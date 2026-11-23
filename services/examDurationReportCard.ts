import {formatDurationCareNote} from './examDurationCareNote';
import {workloadDurationDefinitions} from './workloadDurationGroups';
import type {DurationComparison} from './examDurationComparison';
import {getDurationWorkState,durationWorkLabels,type DurationWorkState} from './examDurationOverview';
export interface DurationCardRow {name:string;label:string;value:number|null;standard:number|null;unit:string;difference:number|null;sampleCount:number;sampleUnit:string;flowCount:number;coverage:number;basis:string;state:DurationWorkState;status:string;careNote?:string;}
export interface DurationCardPage {title:string;period:string;filters:string;page:number;pageCount:number;rows:DurationCardRow[];}
export const formatDurationChartLabel=(entry:{category:string;label:string})=>entry.category==='US'&&!entry.label.startsWith('US')?`US・${entry.label}`:entry.label;
export function buildDurationCardPages(entries:DurationComparison[],options:{mode:'category'|'person';fieldKey:string;staff:string;period:string;filters:string;excludedStaffIds?:string[]}) {
 const selected=entries.filter(r=>r.radiographer_id&&r.fieldKey!=='usFibrosis'&&(options.mode==='category'?r.fieldKey===options.fieldKey&&!options.excludedStaffIds?.includes(r.radiographer_id):r.radiographer_name===options.staff));
 // 分類依原本工作量順序；人員固定姓名順序，不按時間／狀態重排。
 if(options.mode==='category')selected.sort((a,b)=>a.radiographer_name.localeCompare(b.radiographer_name,'zh-Hant'));
 else selected.sort((a,b)=>workloadDurationDefinitions.findIndex(d=>d.key===a.fieldKey)-workloadDurationDefinitions.findIndex(d=>d.key===b.fieldKey));
 const rows=selected.map(r=>{const state=getDurationWorkState(r);return {name:r.radiographer_name,label:`${r.category}・${r.label}`,value:r.value,standard:r.standardMinutes,unit:r.comparisonUnit,difference:r.standardDifferenceMinutes,sampleCount:r.sampleCount,sampleUnit:r.sampleUnit,flowCount:r.flowCount,coverage:r.coverage,basis:r.basis,state,status:durationWorkLabels[state],careNote:formatDurationCareNote(r)};});
 if(!rows.length)return [];
 return [{title:options.mode==='person'?`${options.staff}｜作業概況`:`${selected[0]?formatDurationChartLabel(selected[0]):'檢查耗時'}｜作業概況`,period:options.period,filters:options.filters,page:1,pageCount:1,rows}];
}
const C={navy:'#102b46',blue:'#2563eb',ink:'#16324b',muted:'#64778c',line:'#dce5ee',bg:'#f0f5fa',white:'#ffffff'};
const palettes:Record<DurationWorkState,{ink:string;bg:string;bar:string}>={normal:{ink:'#06745b',bg:'#e8f7f1',bar:'#19a883'},attention:{ink:'#a05c13',bg:'#fff4df',bar:'#e8a541'},observe:{ink:'#376b9b',bg:'#ebf3fc',bar:'#81a9d6'},data:{ink:'#6b7788',bg:'#eef1f5',bar:'#a8b3c1'}};
export function drawDurationReportCard(canvas:HTMLCanvasElement,page:DurationCardPage,scale=2) {
 const width=1200,header=400,rowHeight=150,footer=140,height=header+page.rows.length*rowHeight+footer;
 canvas.width=width*scale;canvas.height=height*scale;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('無法產生圖卡');ctx.scale(scale,scale);
 const box=(x:number,y:number,w:number,h:number,fill:string,r=18)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();};
 const text=(value:string,x:number,y:number,size=24,color=C.ink,bold=false)=>{ctx.font=`${bold?700:400} ${size}px "Noto Sans TC", "PingFang TC", sans-serif`;ctx.fillStyle=color;ctx.fillText(value,x,y);};
 const fit=(value:string,max:number,size=24)=>{ctx.font=`400 ${size}px "Noto Sans TC", "PingFang TC", sans-serif`;if(ctx.measureText(value).width<=max)return value;let v=value;while(v&&ctx.measureText(v+'…').width>max)v=v.slice(0,-1);return v+'…';};
 ctx.fillStyle=C.bg;ctx.fillRect(0,0,width,height);
 const gradient=ctx.createLinearGradient(0,0,width,280);gradient.addColorStop(0,C.navy);gradient.addColorStop(1,'#195773');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,280);
 text('影像醫學部  /  標準時間對照',44,45,21,'#b8d4e5');
 text(fit(page.title,1020,40),44,105,40,C.white,true);
 text(page.period,44,151,24,'#e2edf5');
 ctx.font='400 18px "Noto Sans TC", "PingFang TC", sans-serif';
 const contextLines:string[]=[];let context='';
 for(const ch of page.filters){if(ch==='\n'||ctx.measureText(context+ch).width>1110){contextLines.push(context);context=ch==='\n'?'':ch;}else context+=ch;}
 if(context)contextLines.push(context);
 contextLines.slice(0,4).forEach((line,index)=>text(line,44,180+index*22,18,'#c8dce8'));
 const counts=[{label:'本張項目',n:page.rows.length,color:C.ink},{label:'標準時間內',n:page.rows.filter(r=>r.state==='normal').length,color:palettes.normal.ink},{label:'建議了解',n:page.rows.filter(r=>r.state==='attention').length,color:palettes.attention.ink},{label:'觀察／待補',n:page.rows.filter(r=>r.state==='observe'||r.state==='data').length,color:C.muted}];
 counts.forEach((v,i)=>{const x=44+i*283;box(x,260,263,100,C.white,16);text(v.label,x+20,294,20,C.muted);text(String(v.n),x+20,335,34,v.color,true);});
 const plotX=420,plotWidth=460;
 const max=Math.max(1.5,Math.min(3,Math.ceil(Math.max(...page.rows.map(r=>r.value!==null&&r.standard? r.value/r.standard:0),1)*2)/2));
 const position=(ratio:number)=>plotX+Math.max(0,Math.min(max,ratio))/max*plotWidth;
 text('目前平均 / 排程標準',44,390,18,C.muted);
 text('▏標準 100%（每一項依自己的標準比較）',plotX,390,18,C.muted);
 page.rows.forEach((row,index)=>{
  const y=header+index*rowHeight,p=palettes[row.state];box(32,y,1136,rowHeight-12,C.white,16);box(32,y,6,rowHeight-12,p.bar,3);
  const label=page.title.startsWith(row.name+'｜')?row.label:row.name;
  text(fit(label,340,28),54,y+39,28,C.ink,true);
  text(row.value===null?'—':row.value.toFixed(1),54,y+86,39,row.state==='data'?C.muted:p.ink,true);
  text('分',178,y+84,20,C.muted);
  text(`標準 ${row.standard===null?'待設定':row.standard.toFixed(1)+' 分'}`,54,y+119,20,C.muted);
  box(plotX,y+56,plotWidth,16,'#edf2f7',8);
  if(row.value!==null&&row.standard!==null&&row.standard>0){const ratio=row.value/row.standard;box(plotX,y+56,Math.max(2,position(ratio)-plotX),16,p.bar,8);text(`${Math.round(ratio*100)}%`,plotX,y+40,20,p.ink,true);}
  if(row.standard!==null){ctx.strokeStyle=C.navy;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(position(1),y+48);ctx.lineTo(position(1),y+82);ctx.stroke();}
  if(row.careNote)text(fit(row.careNote,490,18),plotX,y+96,18,row.careNote.startsWith('幽閉：')?'#b91c1c':C.muted,row.careNote.startsWith('幽閉：'));
  text(fit(`有效 ${row.sampleCount}${row.sampleUnit} · 來源 ${row.flowCount} 次 · 覆蓋 ${Math.round(row.coverage*100)}%`,490,18),plotX,y+117,18,C.muted);
  box(920,y+22,220,42,p.bg,12);text(row.state==='attention'?'超出標準，建議了解':row.status,934,y+50,row.state==='attention'?18:20,p.ink,true);
  text(row.difference===null?'暫不判定差異':`${row.difference>0?'+':''}${row.difference.toFixed(1)} 分`,936,y+94,27,p.ink,true);
  text(fit(row.basis,208,16),934,y+120,16,C.muted);
 });
 const foot=header+page.rows.length*rowHeight;
 text('依姓名／分類固定順序呈現，不作快慢排名。標準時間內不等同影像品質合格。',44,foot+35,20,C.ink);
 text('需了解項目請先核對個案難度、設備與等待情形；單次或資料不足先觀察。',44,foot+67,19,C.muted);
 text('US 為排除肝纖維後的比例估計；MR 為完整流程。圖卡僅代表所選範圍與已同步資料。',44,foot+96,17,C.muted);
 text('完整長圖',1050,foot+126,18,C.muted,true);
 return {width:canvas.width,height:canvas.height};
}
