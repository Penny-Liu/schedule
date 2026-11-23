import React,{useState} from 'react';
import {copyTextToClipboard} from '../../services/clipboard';
export default function HealthMgmtSlotLineReport({text,ready}:{text:string;ready:boolean}){
 const [status,setStatus]=useState(''),[copiedFor,setCopiedFor]=useState('');
 return <section aria-label="健管獨立 Slot 計算" className="bg-white border border-teal-100 rounded-xl p-4 mb-4 space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold text-slate-800">健管 Slot 計算</h4><button type="button" disabled={!ready} onClick={async()=>{const ok=await copyTextToClipboard(text);setCopiedFor(text);setStatus(ok?'已複製目前 Slot 計算，可到 LINE 貼上。':'複製未成功，請選取下方文字手動複製。');}} className="bg-teal-700 text-white px-3 py-2 rounded-lg text-sm disabled:opacity-50">複製健管 Slot 到 LINE</button></div>
  <p className="text-xs text-slate-500">僅依健管規則，逐項列出組數 × 單位 slot，以及可用人力 T；待確認醫令列明要確認的內容。</p>
  <textarea aria-label="健管 Slot 計算 LINE 預覽" value={text} readOnly className="w-full h-64 resize-y border rounded-lg p-3 text-sm bg-slate-50 font-mono"/>
  <p role="status" className="text-sm text-teal-800">{copiedFor===text?status:''}</p>
 </section>;
}
