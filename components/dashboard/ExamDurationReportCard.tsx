import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {DurationComparison} from '../../services/examDurationComparison';
import {workloadDurationDefinitions} from '../../services/workloadDurationGroups';
import {buildDurationCardPages,drawDurationReportCard} from '../../services/examDurationReportCard';
import {examDurationChartPng} from '../../services/examDurationChartImage';
import {canCopyPngAutomatically} from '../../services/clipboard';
export default function ExamDurationReportCard({entries,period,filters,initialPerson=false}:{entries:DurationComparison[];period:string;filters:string;initialPerson?:boolean}) {
 const [mode,setMode]=useState<'category'|'person'>(initialPerson?'person':'category');
 const [field,setField]=useState('');const [staff,setStaff]=useState('');const [pageIndex,setPageIndex]=useState(0);
 useEffect(()=>setMode(initialPerson?'person':'category'),[initialPerson]);
 const [preview,setPreview]=useState<{url:string;blob:Blob;identity:string}|null>(null);const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);
 const definitions=workloadDurationDefinitions.filter(d=>d.key!=='usFibrosis'&&entries.some(r=>r.fieldKey===d.key&&r.radiographer_id));
 const names=[...new Set(entries.filter(r=>r.radiographer_id).map(r=>r.radiographer_name))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
 const currentField=definitions.some(d=>d.key===field)?field:definitions[0]?.key||'';
 const currentStaff=names.includes(staff)?staff:names[0]||'';
 const pages=useMemo(()=>buildDurationCardPages(entries,{mode,fieldKey:currentField,staff:currentStaff,period,filters}),[entries,mode,currentField,currentStaff,period,filters]);
 const index=Math.min(pageIndex,Math.max(0,pages.length-1));const page=pages[index];const identity=JSON.stringify(page||null);const identityRef=useRef(identity);identityRef.current=identity;
 useEffect(()=>{setPageIndex(0);setStatus('');},[mode,currentField,currentStaff,period,filters]);
 useEffect(()=>{
  let canceled=false,objectUrl='';setPreview(null);setStatus('');
  if(!page)return;
  (async()=>{try{
   await document.fonts.ready;if(canceled)return;
   const canvas=document.createElement('canvas');drawDurationReportCard(canvas,page);
   const blob=await examDurationChartPng(canvas);if(canceled)return;
   objectUrl=URL.createObjectURL(blob);setPreview({url:objectUrl,blob,identity});
  }catch{if(!canceled)setStatus('圖卡產生失敗，請重新選取項目。');}})();
  return()=>{canceled=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[identity]);
 const ready=preview?.identity===identity?preview:null;
 const copy=async()=>{
  if(!ready)return;
  if(!canCopyPngAutomatically()){setStatus('尚未更新剪貼簿：請對下方目前圖卡按右鍵 →「複製圖片」，再到 LINE 貼上；也可下載 PNG 當附件。');return;}
  setBusy(true);const copiedIdentity=identity;
  try{await navigator.clipboard.write([new ClipboardItem({'image/png':ready.blob})]);if(identityRef.current===copiedIdentity)setStatus('已複製目前圖卡，可到 LINE 貼上。');}
  catch{if(identityRef.current===copiedIdentity)setStatus('自動複製未成功，請對目前圖卡按右鍵複製，或下載 PNG。');}
  finally{setBusy(false);}
 };
 const download=()=>{if(!ready)return;const link=document.createElement('a');const downloadUrl=URL.createObjectURL(ready.blob);link.href=downloadUrl;link.download=`放射師作業概況-${mode==='category'?currentField:currentStaff}-${index+1}.png`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(downloadUrl),10000);setStatus(`已下載第 ${index+1}／${pages.length} 張圖卡，可作為 LINE 附件。`);};
 return <section aria-label="LINE 作業概況圖卡" className="rounded-2xl border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-4 md:p-5 space-y-4">
  <div className="flex flex-wrap justify-between items-start gap-3"><div><p className="text-xs tracking-widest text-sky-700 font-semibold">作業概況 · 圖像報告</p><h4 className="text-xl font-bold text-slate-800 mt-1">一張圖，看懂時間與標準</h4><p className="text-sm text-slate-500 mt-1">保留姓名順序；每張最多 8 列，圖片附上日期、篩選、樣本與判讀說明。</p></div><span className="text-xs bg-white border rounded-full px-3 py-2 text-slate-500">高解析 PNG · LINE 附件</span></div>
  <div className="flex flex-wrap gap-3 items-end">
   <label className="text-xs text-slate-600">圖卡內容<select aria-label="圖卡內容" value={mode} onChange={e=>setMode(e.target.value as 'category'|'person')} className="block bg-white border rounded-lg px-3 py-2 text-sm mt-1"><option value="category">同一檢查・全科概況</option><option value="person">同一同仁・各項檢查</option></select></label>
   {mode==='category'?<label className="text-xs text-slate-600">檢查項目<select aria-label="圖卡檢查項目" value={currentField} onChange={e=>setField(e.target.value)} className="block bg-white border rounded-lg px-3 py-2 text-sm mt-1">{definitions.map(d=><option key={d.key} value={d.key}>{d.category}・{d.label}</option>)}</select></label>:<label className="text-xs text-slate-600">同仁<select aria-label="圖卡同仁" value={currentStaff} onChange={e=>setStaff(e.target.value)} className="block bg-white border rounded-lg px-3 py-2 text-sm mt-1">{names.map(n=><option key={n}>{n}</option>)}</select></label>}
   {pages.length>1&&<label className="text-xs text-slate-600">圖卡頁次<select aria-label="圖卡頁次" value={index} onChange={e=>setPageIndex(Number(e.target.value))} className="block bg-white border rounded-lg px-3 py-2 text-sm mt-1">{pages.map((p,i)=><option key={i} value={i}>{i+1}／{pages.length}（{p.rows.length} 列）</option>)}</select></label>}
   <button type="button" onClick={copy} disabled={!ready||busy} className="rounded-lg bg-sky-800 text-white px-4 py-2 text-sm disabled:opacity-50">{canCopyPngAutomatically()?'複製目前圖卡':'複製圖片（右鍵方式）'}</button><button type="button" onClick={download} disabled={!ready} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-50">下載目前 PNG</button>
  </div>
  {!canCopyPngAutomatically()&&<p className="text-xs text-slate-600">目前連線不支援自動複製 PNG；可對預覽圖片按右鍵複製，或下載後傳到 LINE。</p>}
  <p role="status" className="text-sm text-sky-900">{status}</p>
  {ready?<div className="rounded-xl border border-slate-200 bg-slate-100 p-2 md:p-4 max-h-[75vh] overflow-auto"><a href={ready.url} target="_blank" rel="noreferrer" className="text-xs text-sky-800 underline">開啟目前完整圖卡</a><img src={ready.url} alt={`${page.title}，${period}，第 ${index+1}／${pages.length} 張`} className="block w-full max-w-[900px] h-auto mx-auto mt-2 rounded-lg shadow-sm"/></div>:<p className="text-sm text-slate-500">{page?'正在產生目前圖卡…':'此篩選範圍沒有可呈現的資料。'}</p>}
 </section>;
}
