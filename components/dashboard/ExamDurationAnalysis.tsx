import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Clock, RefreshCw } from 'lucide-react';
import type { User } from '../../types';
import { db } from '../../services/store';
import { fetchExamDuration, type ExamDurationRow, type DurationSyncDay } from '../../services/radiographerExamDuration';
import { summarizeExamDurations } from '../../services/examDurationMetrics';
import { groupWorkloadDurations, workloadDurationDefinitions } from '../../services/workloadDurationGroups';
import {examDurationStandards,EXAM_DURATION_STANDARD_VERSION,getExamStandardMinutes} from '../../services/examDurationStandards';
import ExamDurationComparison from './ExamDurationComparison';
import { buildDurationComparison } from '../../services/examDurationComparison';
import { getRadiographerCycleMonthKey } from '../../services/radiographerCycleDates';

const todayTaipei = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fmt = (value: number | null) => value === null ? '—' : value.toFixed(1);
const reasons = [['missing_time_count','缺少時間'],['zero_count','開始＝完成'],['negative_count','完成早於開始'],['shared_interval_count','時間無法獨立歸屬'],['duplicate_count','重複區間'],['outlier_count','超過 4 小時待確認'],['missing_staff_count','無法唯一歸屬人員'],['invalid_time_count','時間格式錯誤']] as const;

export default function ExamDurationAnalysis({ currentUser }: { currentUser: User }) {
  const today = todayTaipei();
  const cycles = [...db.getCycles()].sort((a,b)=>b.startDate.localeCompare(a.startDate));
  const current = cycles.find(c=>c.startDate<=today&&today<=c.endDate);
  const [cycleId,setCycleId]=useState(current?.id||'custom');
  const [customFrom,setCustomFrom]=useState(`${today.slice(0,7)}-01`);
  const [customTo,setCustomTo]=useState(today);
  const [personal,setPersonal]=useState(false);
  const [staff,setStaff]=useState('');
  const [view,setView]=useState<'overview'|'person'|'department'|'details'>('overview');
  const [category,setCategory]=useState('');
  const [field,setField]=useState('');
  const [location,setLocation]=useState('');
  const [resource,setResource]=useState('');
  const [rows,setRows]=useState<ExamDurationRow[]>([]);
  const [days,setDays]=useState<DurationSyncDay[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [refresh,setRefresh]=useState(0);
  const cycle=cycles.find(c=>c.id===cycleId);
  const from=cycle?.startDate||customFrom,to=cycle?.endDate||customTo;
  const cycleMonth=cycle?getRadiographerCycleMonthKey(cycle):'';
  const ranges=personal&&cycle?Object.fromEntries(db.getUsers().map(user=>[user.name,user.personalCycles?.[cycleMonth]||{startDate:from,endDate:to}])):{};
  const queryFrom=Object.values(ranges).reduce((min,r)=>r.startDate<min?r.startDate:min,from);
  const queryTo=Object.values(ranges).reduce((max,r)=>r.endDate>max?r.endDate:max,to);
  const rangeValid=/^\d{4}-\d{2}-\d{2}$/.test(queryFrom)&&/^\d{4}-\d{2}-\d{2}$/.test(queryTo)&&queryFrom<=queryTo&&(Date.parse(queryTo)-Date.parse(queryFrom))/86400000<=366;
  useEffect(()=>{
    const controller=new AbortController();setRows([]);setDays([]);setError('');
    if(!rangeValid){setLoading(false);return()=>controller.abort();}
    setLoading(true);
    fetchExamDuration(queryFrom,queryTo,controller.signal,currentUser.authUserId).then(data=>{if(!controller.signal.aborted){setRows(data.rows);setDays(data.days);}})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message||'耗時資料讀取失敗。');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[queryFrom,queryTo,rangeValid,refresh,currentUser.authUserId]);
  const scopedRows=rows.filter(row=>{
    if(row.category==='US'?row.algorithm!=='actual-flow-v4':!['actual-flow-v3','actual-flow-v4'].includes(row.algorithm))return false;
    const r=ranges[row.radiographer_name]||{startDate:from,endDate:to};
    return row.exam_date>=r.startDate&&row.exam_date<=r.endDate;
  });
  const filtered=scopedRows.filter(row=>(!staff||row.radiographer_name===staff)&&(!category||row.category===category)&&(!location||row.location===location)&&(!resource||row.resource_name===resource));
  const groups=useMemo(()=>groupWorkloadDurations(filtered,field).filter(row=>Boolean(field)||row.quantity>0||row.valid_count>0||row.allocatedOrderCount>0),[filtered,field]);
  const totals=summarizeExamDurations(filtered.filter(r=>r.metric_scope==='item'||r.metric_scope==='flow'));
  const options=(key:'radiographer_name'|'location'|'resource_name')=>[...new Set(scopedRows.map(row=>row[key]))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
  const synced=new Set(days.filter(d=>d.algorithm==='actual-flow-v4').map(d=>d.exam_date));
  const expected:string[]=[];
  if(rangeValid)for(let t=Date.parse(queryFrom);t<=Math.min(Date.parse(queryTo),Date.parse(today));t+=86400000)expected.push(new Date(t).toISOString().slice(0,10));
  const missing=expected.filter(d=>!synced.has(d));
  const comparison=buildDurationComparison(scopedRows.filter(row=>(!category||row.category===category)&&(!location||row.location===location)&&(!resource||row.resource_name===resource)),field,missing.length>0).filter(r=>r.quantity>0||r.sampleCount>0);
  const displayed=view==='details'?groups:comparison.filter(r=>view!=='person'||r.radiographer_name===staff);
  const lastSync=days.length?[...days].sort((a,b)=>b.synced_at.localeCompare(a.synced_at))[0].synced_at:'';
  const fieldClass='border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm min-w-0';
  const definitions=workloadDurationDefinitions.filter(d=>!category||d.category===category);

  return <section className="space-y-4 pb-8" aria-label="檢查耗時統計">
    <div className="bg-white border rounded-xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-lg flex items-center gap-2"><Clock size={20}/>檢查耗時</h3><p className="text-sm text-slate-500 mt-1">先看全科作業概況，再深入個人與檢查分類；固定依姓名呈現，不作快慢排名。</p></div><button type="button" onClick={()=>setRefresh(n=>n+1)} disabled={loading} className="border rounded-lg px-3 py-2 text-sm flex items-center gap-1 disabled:opacity-50"><RefreshCw size={15}/>重新讀取</button></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="耗時檢視方式">{([['overview','全科作業概況'],['person','個人檢視'],['department','分類明細'],['details','原始明細']] as const).map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>setView(key)} className={`px-4 py-2 rounded-lg border text-sm ${view===key?'bg-sky-700 text-white':'bg-white'}`}>{label}</button>)}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="text-xs text-slate-600 flex flex-col gap-1">統計週期<select className={fieldClass} value={cycleId} onChange={e=>setCycleId(e.target.value)}>{cycles.map(c=><option key={c.id} value={c.id}>{c.name}（{c.startDate}～{c.endDate}）</option>)}<option value="custom">自訂日期</option></select></label>
        {!cycle&&<><label className="text-xs text-slate-600 flex flex-col gap-1">開始日期<input type="date" className={fieldClass} value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/></label><label className="text-xs text-slate-600 flex flex-col gap-1">結束日期<input type="date" className={fieldClass} value={customTo} onChange={e=>setCustomTo(e.target.value)}/></label></>}
        {cycle&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={personal} onChange={e=>setPersonal(e.target.checked)}/>依個人週期起訖日</label>}
        <label className="text-xs text-slate-600 flex flex-col gap-1">檢查類別<select value={category} onChange={e=>{setCategory(e.target.value);setField('');}} className={fieldClass}><option value="">全部</option>{['MR','CT','US','DX','MG','BMD'].map(c=><option key={c}>{c}</option>)}</select></label>
        <label className="text-xs text-slate-600 flex flex-col gap-1">工作量分類<select value={field} onChange={e=>setField(e.target.value)} className={fieldClass}><option value="">全部</option>{definitions.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}</select></label>
        {([['放射師',staff,setStaff,'radiographer_name'],['院區',location,setLocation,'location'],['檢查室／設備',resource,setResource,'resource_name']] as const).filter(([,, ,key])=>key!=='radiographer_name'||(view==='person'||view==='details')).map(([label,value,set,key])=><label key={key} className="text-xs text-slate-600 flex flex-col gap-1">{label}<select value={value} onChange={e=>set(e.target.value)} className={fieldClass}><option value="">全部</option>{[...new Set([...options(key),...(value?[value]:[])])].map(v=><option key={v}>{v}</option>)}</select></label>)}
      </div>
      <p className="text-xs text-slate-500">{from}～{to}{personal&&cycle?'；依個人週期篩選，未設定者使用共同週期。':'；依健檢日期歸屬。'}數量為此頁已完成且已同步的參考數；計時樣本按「次」計算，與醫令數不同。</p>
    </div>
    {!rangeValid&&<p role="alert" className="p-4 bg-red-50 text-red-700 rounded-lg">請選擇有效起訖日，範圍最多 367 天。</p>}
    {error&&<div role="alert" className="p-4 bg-red-50 text-red-700 rounded-lg">{error}<button type="button" className="ml-2 underline" onClick={()=>setRefresh(n=>n+1)}>重試</button></div>}
    {loading&&<p role="status" className="p-4 text-slate-500">正在讀取檢查耗時…</p>}
    {!loading&&!error&&rangeValid&&<>
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-sm text-sky-900 space-y-2">
        <details><summary className="cursor-pointer font-semibold">計算方式與樣本規則</summary><div className="space-y-2 mt-2"><p>US 集合醫令先排除肝纖維，再依甲超1、頸動脈1、腹部2、骨盆1、乳房2、頸部1、心超3分攤整段時間；每筆醫令依比例加總，未提供比例的混合部位暫不分攤。其他類別維持原分攤方式。包含等待與準備，並非單項實測；後處理維持獨立計時。</p><p className="font-semibold flex items-center gap-2"><AlertCircle size={16}/>MR 依有效來源流程數判定：少於 2 次為樣本數不足，反灰且不納入個人標準比較。US、CT 等檢查有 1 筆有效時間即呈現。主要對照使用者設定的排程標準，不需等待其他同仁資料；單次有效時間仍會呈現並先持續觀察。</p><p>MR 同日同醫令同院區的分段合併，扣除重疊區間、不含段落間空檔；跨人員不歸屬個人。MR大女須含乳房 MR，未含者另列。排程平均與紀錄耗時分開顯示。MR 套別與 CTA 主要看每次流程，後處理看獨立計時，其餘看每醫令均攤估計。全科平均按有效樣本加權，包含目前篩選範圍的同仁；個人選擇不縮小全科參考。個人週期起訖可能不同。</p>
        <p>MR、CT、US 等總類別及 MR 套別使用整次流程（報到至完成，包含準備與等候）；US 各部位優先採用只有該部位的流程，原始平均不分攤多部位流程；均攤估計另列。後處理使用自己的開始／結束時間，不混用掃描流程。</p>
        </div></details>
        {missing.length>0&&<p className="font-semibold text-amber-800">尚有 {missing.length} 個已過日期未同步，目前數值僅代表已同步部分；未同步不代表沒有檢查。</p>}
        {lastSync&&<p className="text-xs">最近同步：{new Date(lastSync).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}。US 比例新制須重新同步；尚未同步不沿用舊的等分資料。零值、負值、共用區間與超過 4 小時的紀錄不列入平均。</p>}
      </div>
      {view!=='overview'&&<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['顯示組別',displayed.length],['有原始計時',displayed.filter(r=>r.valid_count>0).length],['有均攤估計',displayed.filter(r=>r.allocatedOrderCount>0).length],['無可用時間',displayed.filter(r=>r.valid_count===0&&r.allocatedOrderCount===0).length]].map(([label,value])=><div key={label} className="p-4 bg-white border rounded-xl"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div>)}</div>}
      <details className="bg-white border rounded-xl p-4"><summary className="cursor-pointer text-sm font-semibold">排程標準時間（{examDurationStandards.length} 項，{EXAM_DURATION_STANDARD_VERSION}）</summary><p className="text-xs text-slate-500 mt-2">依你提供的標準設定；整套與單項分開，MR／US／CT 彙總依有效檢查組合加權。未知項目不補估標準。</p><div className="overflow-auto max-h-72 mt-3"><table className="text-sm w-full text-left"><thead><tr><th>檢查項目</th><th>單位</th><th>標準分鐘</th></tr></thead><tbody>{examDurationStandards.map(s=><tr key={s.key} className="border-t"><td className="py-2">{s.label}</td><td>{s.unit}</td><td>{getExamStandardMinutes(s.key)===null?'不列入耗時':s.minutes}</td></tr>)}</tbody></table></div></details>
      <details className="bg-white border rounded-xl p-4"><summary className="cursor-pointer text-sm font-semibold">來源時間品質明細</summary><p className="text-xs text-slate-500 mt-2">包含流程、單項與後處理各自的來源紀錄，不將它們相加作為檢查量。</p><div className="flex flex-wrap gap-3 mt-3 text-sm">{reasons.map(([key,label])=><span key={key} className="bg-slate-50 rounded px-3 py-2">{label}：{totals[key]}</span>)}</div></details>
      {view!=='details'&&<ExamDurationComparison entries={comparison} staff={staff} onStaff={name=>{setStaff(name);setView('person');}} view={view} period={`${from}～${to}`} filters={`類別：${category||'全部'}｜工作量分類：${definitions.find(d=>d.key===field)?.label||'全部'}｜院區：${location||'全部'}｜設備：${resource||'全部'}${personal&&cycle?'｜依個人週期':''}${missing.length?`｜${missing.length}天未同步`:''}`} periodByStaff={personal&&cycle?Object.fromEntries(Object.entries(ranges).map(([name,r])=>[name,`${r.startDate}～${r.endDate}`])):{}}/>}
      {view==='details'&&<div className="bg-white border rounded-xl overflow-x-auto max-h-[65vh]"><table className="min-w-full text-sm text-left"><thead className="bg-slate-100 sticky top-0"><tr>{['放射師','類別','工作量分類','檢查量參考','有效計時（次）','原平均（分）','原中位數（分）','均攤醫令（項）','每醫令分攤估計（分）','時間口徑','提示'].map(t=><th key={t} className="px-3 py-3 whitespace-nowrap">{t}</th>)}</tr></thead><tbody>
        {groups.map(row=><tr key={row.key} className={`border-t ${row.category==='MR'&&row.valid_count<2?'bg-slate-100 text-slate-400':''}`}><td className="px-3 py-3 whitespace-nowrap">{row.radiographer_name}{personal&&cycle&&<span className="block text-[10px] text-slate-500">{ranges[row.radiographer_name]?.startDate||from}～{ranges[row.radiographer_name]?.endDate||to}</span>}</td><td className="px-3 py-3">{row.category}</td><td className="px-3 py-3 whitespace-nowrap font-medium">{row.label}</td><td className="px-3 py-3 whitespace-nowrap">{row.quantity} {row.quantityUnit}</td><td className="px-3 py-3">{row.valid_count}</td><td className="px-3 py-3 font-semibold">{fmt(row.averageMinutes)}</td><td className="px-3 py-3">{fmt(row.medianMinutes)}</td><td className="px-3 py-3">{row.allocationApplicable?row.allocatedOrderCount:'不適用'}</td><td className="px-3 py-3 font-semibold">{row.allocationApplicable?fmt(row.allocatedAverageMinutes):'獨立計時'}</td><td className="px-3 py-3 whitespace-nowrap text-xs text-slate-500">{row.timeBasis}</td><td className={`px-3 py-3 text-xs min-w-[170px] ${row.category==='MR'&&row.valid_count<2?'text-slate-400':row.reliable?'text-teal-700':'text-amber-700'}`}>{row.note}{row.allocatedOrderCount>0?'；另有均攤估計':''}{missing.length>0&&row.valid_count>0?'；期間未完整同步':''}</td></tr>)}
        {groups.length===0&&<tr><td colSpan={11} className="p-8 text-center text-slate-500">{days.length?'此篩選範圍沒有已同步的檢查紀錄。':'尚無同步資料，完成耗時同步後即可查看。'}</td></tr>}
      </tbody></table></div>}
    </>}
  </section>;
}
