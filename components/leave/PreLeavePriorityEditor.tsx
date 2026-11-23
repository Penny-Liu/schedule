import React,{useEffect,useState} from 'react';
import {LeaveStatus,type LeaveRequest} from '../../types';
export default function PreLeavePriorityEditor({leave,canEdit,onSave}:{leave:LeaveRequest;canEdit:boolean;onSave:(priority:number|null)=>Promise<void>}){
 const [value,setValue]=useState(String(leave.preLeavePriority||'')),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{setValue(String(leave.preLeavePriority||''));setMessage('');},[leave.id,leave.preLeavePriority]);
 const save=async(priority:number|null)=>{setSaving(true);setMessage('');try{await onSave(priority);setMessage('已儲存抽籤順序');}catch(e){setMessage((e as Error).message);}finally{setSaving(false);}};
 return <div className="rounded-lg border border-blue-100 bg-blue-50 p-2 space-y-2 text-xs">
  <p className="font-bold text-blue-800">優先休順序：{leave.preLeavePriority?`第 ${leave.preLeavePriority} 順位`:'未註記'}</p>
  {canEdit&&leave.status!==LeaveStatus.REJECTED&&<><div className="flex flex-wrap items-center gap-2">
   <input aria-label="優先休順位" type="number" min="1" max="999" step="1" value={value} onChange={e=>setValue(e.target.value)} className="w-20 p-1 border rounded bg-white" placeholder="順位" disabled={saving}/>
   <button type="button" disabled={saving||value===''} onClick={()=>save(Number(value))} className="rounded bg-blue-700 px-2 py-1 text-white disabled:opacity-50">儲存順位</button>
   <button type="button" disabled={saving||!leave.preLeavePriority} onClick={()=>save(null)} className="underline text-blue-800 disabled:opacity-50">清除</button>
  </div><p className="text-slate-500">依抽籤結果填寫，僅作註記，不會自動核准。</p></>}
  {message&&<p role="status" className="text-slate-700">{message}</p>}
 </div>;
}
