import React,{useEffect,useState} from 'react';
import {PERMISSION_LABELS,type User} from '../../types';
import {canReferenceStaffPermissions,previewStaffPermissionCopy} from '../../services/staffPermissionCopy';
const labels=(permissions:string[])=>permissions.map(p=>PERMISSION_LABELS[p]||p).join('、')||'無';
export default function StaffPermissionCopy({actor,users,targetId,currentPermissions,onApply}:{actor:User;users:User[];targetId:string|null;currentPermissions:string[];onApply:(permissions:string[])=>void}){
 const [sourceId,setSourceId]=useState(''),[error,setError]=useState(''),[applied,setApplied]=useState<{text:string;key:string}|null>(null);
 const [draft,setDraft]=useState<{sourceId:string;currentKey:string;preview:ReturnType<typeof previewStaffPermissionCopy>}|null>(null);
 const currentKey=JSON.stringify(currentPermissions);
 useEffect(()=>{setDraft(null);setApplied(null);setError('');},[sourceId,targetId]);
 useEffect(()=>{setDraft(null);},[currentKey]);
 const targetAllowed=!targetId||users.some(user=>user.id===targetId&&canReferenceStaffPermissions(actor,user));
 const sources=users.filter(user=>targetAllowed).filter(user=>user.id!==targetId&&canReferenceStaffPermissions(actor,user));
 const source=sources.find(user=>user.id===sourceId);
 const preview=()=>{
  if(!source)return;
  try{setError('');setDraft({sourceId:source.id,currentKey,preview:previewStaffPermissionCopy(actor,source,currentPermissions)});}catch(e){setError((e as Error).message);}
 };
 const apply=()=>{
  if(!source||!draft)return;
  try{
   const latest=previewStaffPermissionCopy(actor,source,currentPermissions);
   if(draft.sourceId!==source.id||draft.currentKey!==currentKey||JSON.stringify(latest)!==JSON.stringify(draft.preview))throw new Error('人員權限已變更，請重新預覽後套用。');
   onApply(latest.permissions);setDraft(null);
   setApplied({text:`已帶入 ${source.name} 的 ${latest.copied.length} 項功能權限，尚未儲存。`,key:JSON.stringify(latest.permissions)});
  }catch(e){setError((e as Error).message);setDraft(null);}
 };
 return <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 space-y-3">
  <h5 className="text-xs font-bold text-teal-900">快速設定：複製其他人員權限</h5>
  <p className="text-xs text-slate-600">確認後取代目前的功能權限；院區、角色、帳密與工作資格維持本人設定，按儲存才生效。</p>
  <label className="block text-xs text-slate-700">參考人員
   <select value={sourceId} onChange={e=>setSourceId(e.target.value)} className="mt-1 w-full border border-teal-200 rounded-lg p-2 bg-white text-sm">
    <option value="">請選擇參考人員</option>{sources.map(user=><option key={user.id} value={user.id}>{user.name}{user.isHealthMgmt?`（${user.healthMgmtLocation||'全部'}）`:''}</option>)}
   </select>
  </label>
  {sources.length===0&&<p className="text-xs text-slate-500">目前沒有可參考的人員。</p>}
  <button type="button" disabled={!source} onClick={preview} className="rounded-lg border border-teal-300 bg-white text-teal-800 px-3 py-2 text-xs font-bold disabled:opacity-50">預覽權限</button>
  {draft&&source&&<div className="rounded-lg bg-white border border-teal-200 p-3 space-y-2 text-xs">
   <p className="font-bold text-slate-800">參考 {source.name} · 套用 {draft.preview.copied.length} 項功能權限</p>
   <p className="text-emerald-700">新增：{labels(draft.preview.added)}</p>
   <p className="text-amber-800">移除：{labels(draft.preview.removed)}</p>
   <details><summary className="cursor-pointer text-slate-700">查看套用後的功能權限</summary><p className="mt-2 leading-relaxed">{labels(draft.preview.copied)}</p></details>
   {draft.preview.excluded.length>0&&<p className="text-slate-500">有 {draft.preview.excluded.length} 項不屬於可複製的功能權限，已排除。</p>}
   <div className="flex gap-2"><button type="button" onClick={apply} className="rounded-lg bg-teal-700 text-white px-3 py-2 font-bold">確認套用到表單</button><button type="button" onClick={()=>setDraft(null)} className="rounded-lg border px-3 py-2">取消</button></div>
  </div>}
  {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
  {applied?.key===currentKey&&<p role="status" className="text-xs font-bold text-teal-800">{applied.text}</p>}
 </div>;
}
