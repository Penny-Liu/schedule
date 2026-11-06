import React, { useState } from 'react';
import { workloadDurationDefinitions } from '../../services/workloadDurationGroups';
import { canCopyPngAutomatically, copyTextToClipboard } from '../../services/clipboard';
import { drawExamDurationChart, examDurationChartPng } from '../../services/examDurationChartImage';
import { sortDurationRows, sortDurationPeople, formatExamDurationLineSummary } from '../../services/examDurationLineSummary';
import { formatDurationDifference, type DurationComparison } from '../../services/examDurationComparison';
import ExamDurationReportCard from './ExamDurationReportCard';
import ExamDurationOverview from './ExamDurationOverview';
import { formatDurationOverviewReport } from '../../services/examDurationOverview';
const fmt=(n:number|null)=>n===null?'—':n.toFixed(1);
const evidence=(r:DurationComparison)=>`${r.flowCount} 次來源流程 · ${Math.round(r.coverage*100)}% 覆蓋`;
const zoneStyle=(r:DurationComparison)=>{
 if(r.durationZone==='faster')return 'bg-teal-50 text-teal-800 border-teal-200';
 if(r.durationZone==='slower')return 'bg-amber-50 text-amber-800 border-amber-200';
 return r.comparable?'bg-teal-50 text-teal-800 border-teal-200':'bg-slate-50 border-slate-200 text-slate-500';
};
const chartPosition=(value:number|null,max:number)=>`${Math.max(0,Math.min(100,((value||0)/max)*100))}%`;
export default function ExamDurationComparison({entries,staff,onStaff,view,period,filters,periodByStaff={}}:{entries:DurationComparison[];staff:string;onStaff:(name:string)=>void;view:'overview'|'person'|'department';period:string;filters:string;periodByStaff?:Record<string,string>}) {
 const [selected,setSelected]=useState<DurationComparison|null>(null);
 const [copyStatus,setCopyStatus]=useState('');
 const [copiedFor,setCopiedFor]=useState('');
 const [chartBusy,setChartBusy]=useState(false);
 const unsorted=view==='person'?entries.filter(e=>e.radiographer_name===staff):entries;
 const visible=sortDurationRows(unsorted,'name','asc');
 const defs=workloadDurationDefinitions.filter(d=>visible.some(e=>e.fieldKey===d.key));
 const people=sortDurationPeople(visible,'','name','asc');
 const lineText=view==='overview'?formatDurationOverviewReport(visible,period,filters):formatExamDurationLineSummary({rows:visible,rankingRows:entries,period,filters});
 const hasLineComparison=view==='overview'?Boolean(lineText):visible.some(r=>r.comparable);
 const detail=selected?entries.find(e=>e.key===selected.key):null;
 const chartRows=view==='department'?people.map(name=>visible.find(r=>r.radiographer_name===name)).filter((r):r is DurationComparison=>Boolean(r)):[];
 const exportChart=async(copy:boolean)=>{
  if(!chartRows.length||chartBusy)return;
  setChartBusy(true);
  try {
   if(copy&&!canCopyPngAutomatically()){
    setCopyStatus('此瀏覽器／網頁環境無法直接複製圖片，請選擇下載 PNG 後傳至 LINE。');
    setChartBusy(false);
    return;
   }
   const canvas=document.createElement('canvas');
   drawExamDurationChart(canvas,chartRows,`${defs[0]?.label||'檢查耗時'} · 同仁比較`,period);
   const blob=await examDurationChartPng(canvas);
   if(copy){
    await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
    setCopyStatus('已複製圖表，可以到 LINE 貼上。');
   }else{
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=`檢查耗時-${defs[0]?.label||'統計'}-${period}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
    setCopyStatus('已下載 PNG 圖表，可傳至 LINE。');
   }
  }catch{
   setCopyStatus('圖表複製失敗，請改用下載 PNG。');
  }finally{
   setChartBusy(false);
  }
 };
 return <div className="space-y-3">
  <ExamDurationReportCard entries={visible} period={period} filters={filters} initialPerson={view==='person'}/>

  {view==='overview'?<ExamDurationOverview entries={visible} onStaff={onStaff}/>:view==='person'&&!staff?<p className="p-6 bg-white border rounded-xl">請選擇一位放射師，查看各項檢查與全科平均。</p>:<div className="bg-white border rounded-xl overflow-auto max-h-[65vh]">
   {view==='person'?<table className="min-w-full text-sm text-left"><thead className="sticky top-0 bg-slate-100"><tr>{['檢查分類','完成數量','完整流程／均攤耗時','排程標準','差異（分）','實際排程平均','全科中位數（輔助）','作業提示','參考區間','有效樣本／完成量','來源流程','覆蓋率','參考程度'].map(t=><th className="p-3 whitespace-nowrap" key={t}>{t}</th>)}</tr></thead><tbody>{visible.map(r=><tr key={r.key} className={`border-t ${!r.eligible?'bg-slate-100 text-slate-400':''}`}><td className="p-3 whitespace-nowrap">{r.category} · {r.label}</td><td className="p-3">{r.quantity} {r.quantityUnit}</td><td className="p-3"><button className={`underline text-left ${r.eligible?'text-sky-800':'text-slate-400'}`} onClick={()=>setSelected(r)}>{fmt(r.value)} {r.comparisonUnit}<small className="block">{r.basis}</small></button></td><td className="p-3">{fmt(r.standardMinutes)}<small className="block text-xs text-slate-500">{r.standardBasis}</small></td><td className="p-3">{r.standardDifferenceMinutes===null?'—':`${r.standardDifferenceMinutes>0?'+':''}${r.standardDifferenceMinutes.toFixed(1)}`}</td><td className="p-3">{fmt(r.plannedAverageMinutes)}{r.plannedAverageMinutes!==null&&<small className="block">{r.plannedSampleCount} 次 · 分／次</small>}</td><td className="p-3 whitespace-nowrap">{fmt(r.referenceMedian)}<small className="block text-slate-500">{r.benchmarkPeople} 人 · {r.benchmarkSamples} {r.sampleUnit}</small></td><td className={`p-3 whitespace-nowrap rounded ${!r.comparable?'text-slate-500':r.durationZone==='slower'?'text-amber-800':r.durationZone==='faster'?'text-teal-800':'text-slate-700'}`}>{r.eligible?(r.comparable?formatDurationDifference(r):'排程標準待設定'):r.reference}</td><td className="p-3 whitespace-nowrap">{r.robustLower===null?'—':`${fmt(r.robustLower)}～${fmt(r.robustUpper)} 分`}</td><td className="p-3">{r.sampleCount}／{r.quantity} {r.sampleUnit}</td><td className="p-3">{r.flowCount} 次</td><td className="p-3">{Math.round(r.coverage*100)}%</td><td className="p-3 whitespace-nowrap">{r.reference}</td></tr>)}</tbody></table>:
   <table className="min-w-full text-sm text-left"><thead className="sticky top-0 z-20 bg-slate-100"><tr><th className="p-3 sticky left-0 bg-slate-100">放射師</th>{defs.map(d=><th key={d.key} className="p-3 whitespace-nowrap">{d.category} · {d.label}<small className="block font-normal">{entries.find(r=>r.fieldKey===d.key)?.comparisonUnit}</small></th>)}</tr></thead><tbody>{people.map(name=><tr key={name} className="border-t"><th className="p-3 whitespace-nowrap sticky left-0 bg-white z-10"><button className="underline text-sky-800" onClick={()=>onStaff(name)}>{name}</button></th>{defs.map(d=>{const r=visible.find(e=>e.radiographer_name===name&&e.fieldKey===d.key);return <td key={d.key} className="p-2 min-w-[155px]">{r?<button onClick={()=>setSelected(r)} className={`w-full rounded-lg p-2 text-left ${!r.eligible?'bg-slate-100 text-slate-400':zoneStyle(r)}`}><span className="font-semibold">{fmt(r.value)} 分</span><small className="block">標準 {fmt(r.standardMinutes)} 分｜差異 {r.standardDifferenceMinutes===null?'—':`${r.standardDifferenceMinutes>0?'+':''}${r.standardDifferenceMinutes.toFixed(1)}`} 分</small>{r.plannedAverageMinutes!==null&&<small className="block">排程 {fmt(r.plannedAverageMinutes)} 分／次</small>}<small className="block">全科平均 {fmt(r.benchmark)} 分</small><small className="block">{formatDurationDifference(r)}</small><small className="block">{r.sampleCount} {r.sampleUnit} · {r.basis}</small><small className="block">{evidence(r)}</small><small className="block">{r.reference}</small></button>:'—'}</td>;})}</tr>)}</tbody></table>}
   {visible.length===0&&<p className="p-6 text-slate-500">此篩選範圍沒有資料。</p>}
  </div>}
  {view==='department'&&defs.length===1&&(()=>{
   const max=Math.ceil(Math.max(...chartRows.flatMap(r=>[r.value||0,r.standardMinutes||0]),1)*1.12);
   return <div className="p-4 bg-white border rounded-xl space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold">{defs[0].label} · 耗時區間圖</h4><p className="text-xs text-slate-500 mt-1">圓點為目前平均耗時，直線為排程標準；中位數只作輔助。彙總列標準依各人檢查組合加權。</p></div><div className="flex gap-2"><button type="button" disabled={chartBusy||!chartRows.length} onClick={()=>exportChart(true)} className="border rounded-lg px-3 py-2 bg-sky-700 text-white text-sm disabled:opacity-50">複製圖表圖片</button><button type="button" disabled={chartBusy||!chartRows.length} onClick={()=>exportChart(false)} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50">下載 PNG</button></div></div><div className="flex flex-wrap gap-4 text-xs"><span className="flex items-center gap-1"><i className="w-0.5 h-3 bg-slate-700"/>排程標準</span><span className="flex items-center gap-1"><i className="w-3 h-3 rounded-full bg-sky-600"/>個人耗時</span></div><div className="relative"><div className="absolute left-[80px] right-[100px] top-0 flex justify-between text-[11px] text-slate-400"><span>0</span><span>{fmt(max/2)}分</span><span>{fmt(max)}分</span></div><div className="pt-5 space-y-1">{chartRows.map(r=>{const zone=r.durationZone==='faster'?'bg-teal-500':r.durationZone==='slower'?'bg-amber-500':'bg-sky-600';return <div key={r.key} className={`grid grid-cols-[80px_1fr_100px] gap-3 items-center min-h-8 rounded px-2 ${zoneStyle(r)}`}><button className="text-left text-sm underline text-sky-800" onClick={()=>onStaff(r.radiographer_name)}>{r.radiographer_name}</button><div className="relative h-3 bg-slate-100 rounded">{r.standardMinutes!==null&&<span title={`排程標準 ${fmt(r.standardMinutes)} 分`} className="absolute inset-y-[-5px] border-l-2 border-slate-700" style={{left:chartPosition(r.standardMinutes,max)}}/>}{r.eligible&&<span title={`${fmt(r.value)} 分`} className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white shadow ${zone}`} style={{left:chartPosition(r.value,max)}}/>}</div><span className="text-sm">{fmt(r.value)}分<small className="block">{r.eligible?(r.comparable?formatDurationDifference(r):'排程標準待設定'):r.reference}</small></span></div>;})}</div></div><p role="status" className="text-sm text-sky-800">{copyStatus}</p></div>;
  })()}
  <section aria-label="檢查耗時 LINE 複製預覽" className="bg-white rounded-xl border p-4 space-y-3">
   <div className="flex justify-between items-center gap-3"><h4 className="font-semibold">{view==='overview'?'主管報告摘要／LINE 預覽':'LINE 複製預覽'}</h4><button type="button" disabled={!hasLineComparison} onClick={async()=>{const ok=await copyTextToClipboard(lineText);setCopiedFor(lineText);setCopyStatus(ok?'已複製目前摘要':'複製未成功，請選取下方文字手動複製。');}} className="border rounded-lg px-4 py-2 bg-sky-700 text-white text-sm disabled:opacity-50">{view==='overview'?'複製報告摘要':'複製 LINE 文字'}</button></div>
   <p className="text-xs text-slate-500">依姓名排列，呈現檢查耗時與作業提示；品質尚未串接，不評定個人優劣。</p>
   {!hasLineComparison&&<p className="text-sm text-slate-500">目前沒有可比較人員，LINE 不列出樣本不足或無有效時間的項目。</p>}
   <textarea aria-label="檢查耗時 LINE 摘要" readOnly value={lineText} className="w-full min-h-[220px] max-h-[45vh] border rounded-lg p-3 font-mono text-sm bg-slate-50"/>
   <p role="status" className="text-sm text-sky-800">{copiedFor===lineText?copyStatus:''}</p>
  </section>
  {detail&&<div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={()=>setSelected(null)}><section role="dialog" aria-modal="true" aria-label="耗時計算依據" className="bg-white rounded-xl p-5 max-w-xl w-full max-h-[85vh] overflow-auto space-y-3" onClick={e=>e.stopPropagation()}><div className="flex justify-between"><h4 className="font-bold">{detail.radiographer_name} · {detail.label}</h4><button onClick={()=>setSelected(null)} className="border rounded px-3 py-1">關閉</button></div><p>{fmt(detail.value)} {detail.comparisonUnit} · {detail.basis}</p><p>使用者排程標準 {fmt(detail.standardMinutes)} {detail.comparisonUnit}；差異 {detail.standardDifferenceMinutes===null?'—':detail.standardDifferenceMinutes.toFixed(1)} 分。{detail.standardBasis}</p><p>實際排程平均 {fmt(detail.plannedAverageMinutes)} 分／次（{detail.plannedSampleCount} 次）；與完整流程紀錄分開計算。</p><p>有效樣本 {detail.sampleCount} {detail.sampleUnit}；來源流程 {detail.flowCount} 次；覆蓋率 {Math.round(detail.coverage*100)}%。{detail.reference}。</p><p>{formatDurationDifference(detail)}</p><p>全科平均 {fmt(detail.benchmark)} {detail.comparisonUnit}，來自 {detail.benchmarkPeople} 人、{detail.benchmarkSamples} {detail.sampleUnit}、{detail.benchmarkFlows} 次流程。</p><p>原始計時平均 {fmt(detail.averageMinutes)} 分，中位數 {fmt(detail.medianMinutes)} 分；每醫令均攤估計 {fmt(detail.allocatedAverageMinutes)} 分。</p><p className="text-sm text-slate-600">均攤醫令共享同一次時間來源，不能當作多次獨立實測。流程包含等待及準備；不同套別、院區與設備條件可能影響比較。</p><details><summary>原始計時排除原因</summary><p className="text-sm mt-2">缺少時間 {detail.missing_time_count}；零值 {detail.zero_count}；負值 {detail.negative_count}；共用區間 {detail.shared_interval_count}；超過四小時 {detail.outlier_count}；無法歸屬人員 {detail.missing_staff_count}；格式錯誤 {detail.invalid_time_count}；重複 {detail.duplicate_count}。</p></details></section></div>}
 </div>;
}
