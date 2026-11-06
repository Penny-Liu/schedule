import type {ExamDurationRow} from './radiographerExamDuration';
import {getUsDurationSubtype} from './examDurationSubtype.mjs';
export const EXAM_DURATION_STANDARD_VERSION='2026-11-06-us-weighted';
export const examDurationStandards=[
 {key:'mrLargeMale',label:'MR 大男',unit:'每套',minutes:75},
 {key:'mrLargeFemale',label:'MR 大女（含乳房）',unit:'每套',minutes:90},
 {key:'mrLargeFemaleNoBreast',label:'MR 大女（未含乳房）',unit:'每套',minutes:60},
 {key:'mrMedium',label:'MR 中套',unit:'每套',minutes:55},
 {key:'mrSmall',label:'MR 小套',unit:'每套',minutes:40},
 {key:'mrPostProcessing',label:'MR 後處理',unit:'每次',minutes:10},
 {key:'usA',label:'US 腹部',unit:'每項醫令',minutes:15},
 {key:'usBreast',label:'US 乳房',unit:'每項醫令',minutes:15},
 {key:'usHeart',label:'US 心臟',unit:'每項醫令',minutes:25},
 {key:'usThy',label:'US 甲狀腺',unit:'每項醫令',minutes:10},
 {key:'usCCA',label:'US 頸動脈',unit:'每項醫令',minutes:10},
 {key:'usNeck',label:'US 頸部',unit:'每項醫令',minutes:10},
 {key:'usPelvisFemale',label:'US 骨盆女（P女）',unit:'每項醫令',minutes:7},
 {key:'usPelvisMale',label:'US 骨盆男（P男）',unit:'每項醫令',minutes:5},
 {key:'usFibrosis',label:'US 肝纖維（不列入耗時）',unit:'每項醫令',minutes:3,excludedFromTiming:true},
 {key:'ctGeneral',label:'CT 一般檢查',unit:'每項醫令',minutes:5},
 {key:'cta',label:'CTA',unit:'每次',minutes:15},
 {key:'ctaPostProcessing',label:'CT 後處理',unit:'每次',minutes:45},
 {key:'dx',label:'DX',unit:'每項醫令',minutes:5},
 {key:'mg',label:'MG',unit:'每項醫令',minutes:15},
 {key:'bmd',label:'BMD',unit:'每項醫令',minutes:7},
] as const;
export function getExamStandardMinutes(key:string):number|null{const standard=examDurationStandards.find(s=>s.key===key);return !standard||('excludedFromTiming' in standard&&standard.excludedFromTiming)?null:standard.minutes;}
function mrKey(label:string) {
 if(label.includes('大型套（未含乳房）'))return 'mrLargeFemaleNoBreast';
 if(label.includes('大型套'))return /・(女|F|Female)$/i.test(label)?'mrLargeFemale':/・(男|M|Male)$/i.test(label)?'mrLargeMale':'';
 if(label.includes('中型套'))return 'mrMedium';
 return label.includes('小型套')?'mrSmall':'';
}
export function resolveDurationStandard(rows:ExamDurationRow[],fieldKey:string,sampleCount:number) {
 const direct=getExamStandardMinutes(fieldKey);
 if(direct!==null)return {standardMinutes:direct,standardBasis:'使用者提供的排程標準'};
 if(!sampleCount)return {standardMinutes:null,standardBasis:'缺少可加權樣本'};
 const category=fieldKey.toUpperCase();
 const allocated=rows.filter(r=>r.metric_scope==='allocated'&&r.category===category&&r.valid_count>0);
 const sources=rows.filter(r=>r.metric_scope==='allocation_flow'&&r.category===category&&r.exam_name.split('｜')[2]==='全部'&&r.valid_count>0);
 if(allocated.reduce((n,r)=>n+r.valid_count,0)!==sampleCount)return {standardMinutes:null,standardBasis:'檢查組合尚未完整連結'};
 let total=0;
 if(fieldKey==='us') {
  for(const r of allocated){const key=getUsDurationSubtype(r.exam_name.split('｜').slice(2).join('｜'));const minutes=getExamStandardMinutes(key||'');if(minutes===null)return {standardMinutes:null,standardBasis:'部分 US 部位尚無標準'};total+=minutes*r.valid_count;}
 }else if(fieldKey==='mr') {
  if(!sources.length)return {standardMinutes:null,standardBasis:'MR 套別來源待同步'};
  for(const r of sources){const minutes=getExamStandardMinutes(mrKey(r.exam_name.split('｜')[1]));if(minutes===null)return {standardMinutes:null,standardBasis:'部分 MR 套別尚無標準'};total+=minutes*r.valid_count;}
 }else if(fieldKey==='ct') {
  const ctaOrders=allocated.filter(r=>r.exam_name.split('｜')[1]==='CTA流程').reduce((n,r)=>n+r.valid_count,0);
  const ctaFlows=sources.filter(r=>r.exam_name.split('｜')[1]==='CTA流程').reduce((n,r)=>n+r.valid_count,0);
  if(ctaOrders&&!ctaFlows)return {standardMinutes:null,standardBasis:'CTA 流程來源待同步'};
  total=(sampleCount-ctaOrders)*getExamStandardMinutes('ctGeneral')!+ctaFlows*getExamStandardMinutes('cta')!;
 }else return {standardMinutes:null,standardBasis:'尚未設定排程標準'};
 return {standardMinutes:total/sampleCount,standardBasis:'依有效檢查組合加權'};
}
