import React,{useEffect,useRef,useState} from 'react';
import {RefreshCw,X} from 'lucide-react';
import {UserRole,type User} from '../../types';
import {isDeveloperSandboxActive,SANDBOX_BLOCKED} from '../../services/developerSandbox';
import {dispatchBackendSync} from '../../services/backendSync';
export default function DailyBackendSync({date,currentUser,onRefresh}:{date:string;currentUser:User;onRefresh:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[start,setStart]=useState(date),[end,setEnd]=useState(date),[daily,setDaily]=useState(true),[doctors,setDoctors]=useState(true);
 const [busy,setBusy]=useState(false),[reading,setReading]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[url,setUrl]=useState('');
 const running=useRef(false);
 useEffect(()=>{setStart(date);setEnd(date);setMessage('');setError('');setUrl('');},[date]);
 if(![UserRole.SUPERVISOR,UserRole.SYSTEM_ADMIN].includes(currentUser.role))return null;
 const sandbox=isDeveloperSandboxActive();
 const refresh=async()=>{setReading(true);setError('');try{await onRefresh();setMessage('已讀取目前後台資料。若雲端同步仍在執行，請完成後再讀取。');}catch(e){setError(`讀取失敗：${(e as Error).message}`);}finally{setReading(false);}};
 const sync=async()=>{
  if(running.current)return;
  if(!daily&&!doctors){setError('請至少選擇一項同步內容');return;}
  if(!start||!end){setError('請選擇開始與結束日期');return;}
  running.current=true;setBusy(true);setError('');setMessage('');setUrl('');
  try{
   const tasks=[{id:1,selected:daily,start,end},{id:3,selected:doctors,start,end}].filter(task=>task.selected);
   const result=await dispatchBackendSync(tasks);
   if(result.mode==='cloud'){setMessage('已送出背景同步，尚未完成。請稍後查看執行狀態，完成後按「讀取最新資料」。');setUrl(result.workflowUrl||'');}
   else if(result.mode==='local'){
    setMessage('後台同步已完成。');
    try{await onRefresh();setMessage('後台同步已完成，畫面資料已更新。');}catch(e){setError(`同步已完成，但畫面讀取失敗：${(e as Error).message}`);}
   }
  }catch(e){setError((e as Error).message);}finally{running.current=false;setBusy(false);}
 };
 return <>
  <button type="button" disabled={sandbox} title={sandbox?SANDBOX_BLOCKED:'同步目前選取日的檢查量與醫師工作量'} onClick={()=>setOpen(true)} className="px-3 py-1.5 text-sm bg-indigo-50 text-indigo-700 font-bold rounded-lg border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 flex items-center gap-1.5"><RefreshCw size={14}/>後台同步</button>
  {open&&<div className="fixed inset-0 z-[100] bg-slate-900/40 p-4 flex items-center justify-center"><div role="dialog" aria-modal="true" aria-labelledby="daily-sync-title" className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90dvh] overflow-y-auto p-5 space-y-4">
   <div className="flex justify-between items-center"><h3 id="daily-sync-title" className="font-bold text-slate-800">今日視角・後台同步</h3><button type="button" aria-label="關閉同步視窗" disabled={busy||reading} onClick={()=>setOpen(false)}><X size={20}/></button></div>
   <p className="text-sm text-slate-600">目前選取日：{date}。預設同步這一天，可調整範圍以更新 MR 未來排程。</p>
   <fieldset disabled={busy||reading} className="space-y-3">
    <div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-700">開始日期<input type="date" value={start} onChange={e=>setStart(e.target.value)} className="mt-1 border rounded p-2 w-full"/></label><label className="text-xs text-slate-700">結束日期<input type="date" value={end} onChange={e=>setEnd(e.target.value)} className="mt-1 border rounded p-2 w-full"/></label></div>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>{setStart(date);setEnd(date);}} className="text-xs border rounded px-2 py-1">目前選取日</button><button type="button" onClick={()=>{const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+30);setStart(date);setEnd(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);}} className="text-xs border rounded px-2 py-1">選取日＋未來30天</button></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={daily} onChange={e=>setDaily(e.target.checked)}/>每日統計（醫令數、客戶量、MR 排程）</label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={doctors} onChange={e=>setDoctors(e.target.checked)}/>影像醫師工作量分類</label>
   </fieldset>
   {message&&<p role="status" className="text-sm text-teal-800 bg-teal-50 p-3 rounded">{message}</p>}{error&&<p role="alert" className="text-sm text-red-700 bg-red-50 p-3 rounded">{error}</p>}
   {url&&<a href={url} target="_blank" rel="noopener noreferrer" className="block text-sm text-indigo-700 underline">查看雲端同步執行狀態</a>}
   <div className="flex flex-wrap gap-2"><button type="button" disabled={busy||reading||sandbox} onClick={sync} className="rounded bg-indigo-700 text-white text-sm px-3 py-2 disabled:opacity-50">{busy?'處理中…':'開始同步'}</button><button type="button" disabled={busy||reading} onClick={refresh} className="rounded border text-sm px-3 py-2 disabled:opacity-50">{reading?'讀取中…':'讀取最新資料'}</button></div>
  </div></div>}
 </>;
}
