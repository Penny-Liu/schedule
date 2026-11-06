import React,{useState} from 'react';
import type {User} from '../../types';
import {examDurationStandards,getExamStandardMinutes,type DurationStandardOverrides} from '../../services/examDurationStandards';
import {canEditDurationStandards,saveSharedDurationStandards} from '../../services/sharedExamDurationStandards';
import {isDeveloperSandboxActive} from '../../services/developerSandbox';
export default function ExamDurationStandardSettings({values,user,onSaved,disabled=false}:{values:DurationStandardOverrides;user:User;onSaved:()=>Promise<void>;disabled?:boolean}) {
 const [draft,setDraft]=useState<Record<string,string>|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[baseSignature,setBaseSignature]=useState('');
 const editable=canEditDurationStandards(user);
 const signature=JSON.stringify(Object.entries(values).sort(([a],[b])=>a.localeCompare(b)));
 const defaults=()=>Object.fromEntries(examDurationStandards.filter(s=>s.key!=='usFibrosis').map(s=>[s.key,String(s.minutes)]));
 const current=()=>Object.fromEntries(examDurationStandards.filter(s=>s.key!=='usFibrosis').map(s=>[s.key,String(getExamStandardMinutes(s.key,values))]));
 const save=async()=>{if(!draft)return;if(baseSignature!==signature){setMessage('共用標準已更新，請取消修改後重新確認再儲存。');return;}setBusy(true);setMessage('');try{await saveSharedDurationStandards(Object.fromEntries(Object.entries(draft).map(([k,v])=>[k,v.trim()?Number(v):NaN])),user);await onSaved();setDraft(null);setMessage(isDeveloperSandboxActive()?'已模擬儲存，正式共用標準未變更。':'已儲存全科共用標準。');}catch(e){setMessage(e&&typeof e==='object'&&'message' in e?String(e.message):'儲存失敗，請重新嘗試。');}finally{setBusy(false);}};
 return <details className="bg-white border rounded-xl p-4"><summary className="cursor-pointer text-sm font-semibold">標準時間設定（全科共用，點此展開）</summary>
  <p className="text-xs text-slate-500 mt-2">儲存後套用至全科統計、圖卡與 LINE；彙總依有效檢查組合加權。肝纖維維持不列入耗時。</p>
  {draft&&baseSignature!==signature&&<p className="text-sm text-amber-800 mt-2">共用標準已有更新，請取消修改後重新確認。</p>}
  {!editable&&<p className="text-xs text-slate-500 mt-2">由放射師主管或系統管理員調整。</p>}
  <div className="overflow-auto max-h-80 my-3"><table className="text-sm w-full text-left"><thead className="sticky top-0 bg-white"><tr><th>檢查項目</th><th>單位</th><th>標準分鐘</th></tr></thead><tbody>{examDurationStandards.map(s=><tr key={s.key} className="border-t"><td className="py-2">{s.label}</td><td>{s.unit}</td><td>{s.key==='usFibrosis'?'不列入耗時':editable?<input aria-label={`${s.label}標準分鐘`} type="number" min="0.1" max="1440" step="0.1" disabled={busy||disabled} value={draft?.[s.key]??getExamStandardMinutes(s.key,values)??''} onChange={e=>{const value=e.target.value;if(!draft)setBaseSignature(signature);setDraft(prev=>({...prev||current(),[s.key]:value}));setMessage('尚未儲存');}} className="border rounded px-2 py-1 w-24 my-1"/>:getExamStandardMinutes(s.key,values)}</td></tr>)}</tbody></table></div>
  {editable&&<div className="flex flex-wrap gap-3"><button type="button" disabled={busy||disabled||!draft} onClick={save} className="bg-sky-800 text-white rounded px-3 py-2 text-sm disabled:opacity-50">{busy?'儲存中…':'儲存共用標準'}</button><button type="button" disabled={busy} onClick={()=>{setDraft(null);setMessage('已取消未儲存的修改');}} className="text-sm underline">取消修改</button><button type="button" disabled={busy||disabled} onClick={()=>{setBaseSignature(signature);setDraft(defaults());setMessage('已填入預設值，儲存後才生效');}} className="text-sm underline">填入預設值</button></div>}
  <p role="status" className="text-sm mt-2 text-sky-900">{message}</p>
 </details>;
}
