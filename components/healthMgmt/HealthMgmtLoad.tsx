import {formatHealthMgmtSlotLineSummary,healthMgmtPendingQuestion} from '../../services/healthMgmtLoadLineSummary';
import HealthMgmtSlotLineReport from './HealthMgmtSlotLineReport';
import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import type {HealthMgmtShift,HealthMgmtStaff} from '../../types';
import {fetchHealthMgmtLoad} from '../../services/healthMgmtLoadData';
import {calculateHealthMgmtCapacity,calculateHealthMgmtLoad,isHealthMgmtSnapshotReady,type HMHSupportShift,type HMLoadSnapshot,type HMLoadSyncDay,type HealthMgmtCampus} from '../../services/healthMgmtLoad';
import {HM_LOAD_RULES,HM_LOAD_ALGORITHM} from '../../services/healthMgmtLoadRules.mjs';
const number=(n:number|null)=>n===null?'—':Number.isInteger(n)?String(n):n.toFixed(1);
const style=(status:string)=>status==='紅區'||status==='無可用人力'?'bg-red-50 text-red-700':status==='綠區'?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-800';
export default function HealthMgmtLoad({dates,location,shifts,staff,authUserId,cards=false,supportShifts=[],supportReady=true}:{dates:string[];location:string;shifts:HealthMgmtShift[];staff:HealthMgmtStaff[];authUserId?:string;cards?:boolean;supportShifts?:HMHSupportShift[];supportReady?:boolean}){
 const [rows,setRows]=useState<HMLoadSnapshot[]>([]),[days,setDays]=useState<HMLoadSyncDay[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0);
 const [selected,setSelected]=useState<{date:string;location:HealthMgmtCampus}|null>(null);
 const from=dates[0]||'',to=dates.at(-1)||'';
 useEffect(()=>{if(!from||!to)return;const controller=new AbortController();setLoading(true);setError('');setRows([]);setDays([]);
 fetchHealthMgmtLoad(from,to,authUserId,controller.signal).then(data=>{if(!controller.signal.aborted){setRows(data.rows);setDays(data.days);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message||'健管負載讀取失敗');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[from,to,authUserId,refresh]);
 const campuses:HealthMgmtCampus[]=location==='全部'?['北投','大直']:location==='北投'||location==='大直'?[location]:[];
 const value=(date:string,campus:HealthMgmtCampus)=>{
  const snapshot=rows.find(r=>r.exam_date===date&&r.location===campus&&r.algorithm===HM_LOAD_ALGORITHM);
  const synced=!loading&&!error&&isHealthMgmtSnapshotReady(snapshot,days.find(d=>d.exam_date===date&&d.algorithm===HM_LOAD_ALGORITHM));
  const capacity=calculateHealthMgmtCapacity(date,campus,shifts,staff,supportShifts);
  if(!supportReady)capacity.excluded.push({id:'support-not-ready',name:'H 支援',reason:'H 支援名單未就緒，請重新整理頁面確認'});
  return {snapshot,synced,...calculateHealthMgmtLoad(snapshot,synced,capacity)};
 };
 const detail=selected?value(selected.date,selected.location):null;
 const rateText=(r:ReturnType<typeof value>)=>r.rate===null?r.status:`${r.rate.toFixed(1)}%${r.unresolved||r.unknownCapacity?'（待確認）':''}`;
 const modal=selected&&detail&&typeof document!=='undefined'?createPortal(<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={()=>setSelected(null)}><section role="dialog" aria-modal="true" aria-label="健管負載計算明細" className="max-w-3xl w-full max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-xl p-5 space-y-4" onClick={e=>e.stopPropagation()}>
  <div className="sticky top-0 bg-white flex justify-between items-center py-2"><h3 className="font-bold text-lg">{selected.location}・{selected.date} 健管負載</h3><button type="button" className="border rounded px-3 py-1" onClick={()=>setSelected(null)}>關閉</button></div>
  <p className={`p-3 rounded-lg font-bold ${style(detail.status)}`}>S／T {rateText(detail)}｜S {number(detail.demand)} slot｜T {detail.supplySlots} slot（{detail.staffCount} 人）</p>
  <p className="text-sm text-slate-600">1 slot＝10 分鐘；每人 T＝30 slot。計入 H／HA 及已對應的 H 支援，行政、場控、主控排除，輔控計入。依已安排的有效醫令估算，不代表實際完成或等候時間。</p>
  {(detail.unresolved||detail.unknownCapacity)&&<p className="bg-amber-50 text-amber-900 p-3 rounded text-sm">存在待確認資料，目前需求可能低估或人力未完整分配，請先核對明細，再判斷人力是否充足。</p>}
  {!detail.synced&&<p className="text-amber-800">{loading?'正在讀取':error||'此日尚未同步，不能視為零檢查量。'}</p>}
  {detail.synced&&<><p className="text-sm">已辨識服務客戶 {detail.snapshot?.customer_count||0} 位｜需求 {number((detail.demand||0)*10)} 分鐘｜{detail.remainingSlots!==null&&detail.remainingSlots<0?'缺口':'餘裕'} {number(Math.abs(detail.remainingSlots||0))} slot｜依目前已辨識需求至少再需 {detail.additionalStaff} 人</p>
  <table className="w-full text-sm text-left"><thead><tr><th className="py-2">服務分類</th><th>客戶／組數</th><th>每組 slot</th><th>需求 slot</th></tr></thead><tbody>{HM_LOAD_RULES.map(rule=><tr key={rule.key} className="border-t"><td className="py-2">{rule.label}</td><td>{detail.snapshot?.counts[rule.key]||0}</td><td>{rule.slots}</td><td>{number((detail.snapshot?.counts[rule.key]||0)*rule.slots)}</td></tr>)}</tbody></table>
  <p className="text-xs text-slate-500">同一客戶／日期／院區每類最多計一次；檢備多項合計 2 slot，基礎 A 多項合計 1.5 slot。基礎 B 各項分開計，抹片不同醫令變體仍合併一次。</p>
  <details open={Boolean(detail.snapshot?.unmapped_count)}><summary className="font-semibold cursor-pointer">醫令對照／待確認（{detail.snapshot?.unmapped_count||0} 筆）</summary><div className="overflow-x-auto"><table className="text-sm w-full text-left mt-2"><thead><tr><th>醫令名稱</th><th>資源類別</th><th>原始筆數</th><th>分類</th></tr></thead><tbody>{detail.snapshot?.items.map((item,i)=><tr key={i} className={`border-t ${item.kind==='unmapped'?'text-amber-800':''}`}><td className="py-2">{item.name}</td><td>{item.category}</td><td>{item.order_count}</td><td>{item.kind==='report'?'報告用醫令・不計 Slot':item.kind==='unmapped'?`待確認・未計 slot：${healthMgmtPendingQuestion(item.name)}`:HM_LOAD_RULES.find(rule=>rule.key===item.key)?.label}</td></tr>)}</tbody></table></div><p className="text-xs mt-2">缺少客戶／預約識別 {detail.snapshot?.missing_identity_count||0} 筆未計入；以預約代替客戶去重 {detail.snapshot?.fallback_identity_count||0} 筆需核對。</p></details>
  <p className="text-xs text-slate-500">最近同步：{new Date(days.find(d=>d.exam_date===selected.date)!.synced_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}</p></>}
  <HealthMgmtSlotLineReport text={formatHealthMgmtSlotLineSummary(selected.date,[{location:selected.location,synced:detail.synced,snapshot:detail.snapshot,capacity:detail}])} ready={detail.synced}/>
  <details><summary className="font-semibold cursor-pointer">可用人力與排除原因</summary><p className="text-sm mt-2">計入：{detail.included.map(s=>`${s.name}（${s.station}）`).join('、')||'無'}</p>{detail.excluded.map(s=><p className="text-sm text-amber-800" key={s.id}>{s.name}：{s.reason}</p>)}<p className="text-xs text-slate-500 mt-2">同人同院區不重複計算；跨院區或未指定院區暫不分配。H 支援以姓名／別名對應健管人員後合併去重；未對應或同名不明者列待確認，不自動增加 T。</p></details>
  <details><summary className="cursor-pointer text-sm">檢查醫令分類規則</summary>{HM_LOAD_RULES.map(rule=><p key={rule.key} className="text-xs mt-2"><strong>{rule.label}（{rule.slots} slot）</strong>：{rule.names.join('、')}</p>)}</details>
  <button type="button" className="text-sky-800 underline text-sm" onClick={()=>setRefresh(n=>n+1)}>重新讀取同步資料</button>
 </section></div>,document.body):null;
 if(cards)return <><div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">{campuses.map(campus=>{const r=value(from,campus);return <button type="button" key={campus} onClick={()=>setSelected({date:from,location:campus})} className={`rounded-xl border p-4 text-left ${style(r.status)}`}><strong>{campus} H／HA 負載</strong><p className="text-xl font-bold my-1">{loading?'讀取中…':error?'尚無資料':rateText(r)}</p><p className="text-sm">S {number(r.demand)} slot ／ T {r.supplySlots} slot（{r.staffCount} 人）</p><p className="text-xs mt-1">點此查看檢查分類、人力與待確認醫令</p></button>;})}</div><HealthMgmtSlotLineReport text={formatHealthMgmtSlotLineSummary(from,campuses.map(location=>{const r=value(from,location);return {location,synced:r.synced,snapshot:r.snapshot,capacity:r};}))} ready={!loading&&!error&&campuses.some(location=>value(from,location).synced)}/>{modal}</>;
 return <>{campuses.flatMap(campus=>['需求 S','人力 T','負載 S／T'].map((label,index)=><tr key={campus+label} className="border-b"><th className="sticky left-0 z-30 bg-cyan-50 text-cyan-900 text-xs p-2 text-left whitespace-nowrap">{campus}・{label}{index===0&&<span className="block text-[10px] font-normal">點數值看統計明細</span>}</th>{dates.map(date=>{const r=value(date,campus);return <td className="p-1 text-center border-r" key={date}><button type="button" aria-label={`${campus} ${date} ${label}明細`} onClick={()=>setSelected({date,location:campus})} className={`rounded px-1 py-1 text-[10px] font-bold whitespace-nowrap ${index===2?style(r.status):'text-cyan-900'}`}>{index===1?`${r.supplySlots} (${r.staffCount}人)${!supportReady?'・待確認':''}`:loading?'讀取中':error?'未就緒':index===0?number(r.demand):rateText(r)}</button></td>;})}</tr>))}
  {error&&<tr><td colSpan={dates.length+1} className="text-xs p-2 text-amber-800">{error} 請至「後台資料同步」選擇健管檢查量。</td></tr>}
  {rows.some(r=>r.location==='未辨識'&&r.items.length>0)&&<tr><td colSpan={dates.length+1} className="text-xs p-2 text-amber-800">有檢查醫令未辨識院區，未併入任一院區需求，請管理者核對同步稽核。</td></tr>}{modal}</>;
}
