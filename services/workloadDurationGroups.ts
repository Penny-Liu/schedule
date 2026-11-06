import type { ExamDurationRow } from './radiographerExamDuration';
import { summarizeExamDurations } from './examDurationMetrics';

import { getUsDurationSubtype } from './examDurationSubtype.mjs';
export { getUsDurationSubtype } from './examDurationSubtype.mjs';

const post = (r: ExamDurationRow) => r.exam_name === 'MR後處理' || r.exam_name === 'CT後處理';
const item = (r: ExamDurationRow) => r.metric_scope === 'item' && !post(r);
const flow = (r: ExamDurationRow) => r.metric_scope === 'flow' && r.exam_name !== 'CTA';
interface Definition {
  key: string; label: string; category: string;
  counts: (r: ExamDurationRow) => boolean;
  timing: (r: ExamDurationRow) => boolean;
  unit: string; timeBasis: string;
}
const main = (category: string, label = category): Definition => ({
 key:category.toLowerCase(), label, category, counts:r=>r.category===category&&item(r)&&(category!=='US'||getUsDurationSubtype(r.exam_name)!=='usFibrosis'),timing:r=>r.category===category&&flow(r)&&(category!=='US'||r.exam_name.split('｜').slice(1).join('｜').split('＋').some(name=>getUsDurationSubtype(name)!=='usFibrosis')),unit:'醫令',timeBasis:'整次流程（報到至完成）',
});
const mrSize = (key: string,label: string,match: (name:string)=>boolean):Definition => ({
 key,label,category:'MR',counts:r=>r.category==='MR'&&flow(r)&&match(r.exam_name),timing:r=>r.category==='MR'&&flow(r)&&match(r.exam_name),unit:'次',timeBasis:'完整 MR 流程（分段合併、扣除重疊與空檔）',
});
const postDefinition = (category: string):Definition => ({key:category==='MR'?'mrPostProcessing':'ctaPostProcessing',label:`${category}後處理`,category,counts:r=>r.category===category&&post(r),timing:r=>r.category===category&&post(r),unit:'次',timeBasis:'後處理開始至結束'});
const usSubtype = (key: string,label: string):Definition=>({
 key,label,category:'US',counts:r=>r.category==='US'&&item(r)&&getUsDurationSubtype(r.exam_name)===key,
 timing:r=>key!=='usFibrosis'&&r.category==='US'&&flow(r)&&r.exam_name.split('｜').slice(1).join('｜').split('＋').every(name=>getUsDurationSubtype(name)===key),
 unit:'醫令',timeBasis:'單一部位流程（報到至完成）',
});
export const workloadDurationDefinitions: Definition[] = [
 main('MR','MR醫令數'),
 mrSize('mrLargeMale','MR大男',n=>n.includes('大型套')&&/・(男|M|Male)$/i.test(n)),
 mrSize('mrLargeFemale','MR大女',n=>n.includes('大型套（7 項以上）')&&/・(女|F|Female)$/i.test(n)),
 mrSize('mrLargeFemaleNoBreast','MR大女（未含乳房）',n=>n.includes('大型套（未含乳房）')&&/・(女|F|Female)$/i.test(n)),
 mrSize('mrMedium','MR中',n=>n.includes('中型套')),
 mrSize('mrSmall','MR小',n=>n.includes('小型套')),
 postDefinition('MR'), main('US'),
 usSubtype('usA','腹'),usSubtype('usBreast','乳'),usSubtype('usHeart','心'),usSubtype('usThy','甲'),
 usSubtype('usCCA','頸動脈'),usSubtype('usNeck','頸部'),usSubtype('usPelvisFemale','P女'),usSubtype('usPelvisMale','P男'),usSubtype('usFibrosis','肝纖'),
 main('CT'),{key:'ctGeneral',label:'CT一般',category:'CT',counts:r=>r.category==='CT'&&r.metric_scope==='allocated'&&r.exam_name.split('｜')[1]!=='CTA流程',timing:r=>r.category==='CT'&&r.metric_scope==='allocated'&&r.exam_name.split('｜')[1]!=='CTA流程',unit:'醫令',timeBasis:'一般 CT 每醫令均攤估計'}, {key:'cta',label:'CTA',category:'CT',counts:r=>r.category==='CT'&&r.exam_name==='CTA',timing:r=>r.category==='CT'&&r.exam_name==='CTA',unit:'次',timeBasis:'CTA流程（報到至完成）'},
 postDefinition('CT'),main('DX'),main('MG'),main('BMD'),
];

// 院區／設備先由使用者篩選，預設不再把每個組合拆成獨立小樣本。
export function groupWorkloadDurations(rows: ExamDurationRow[], selectedKey = '') {
 const people = new Map<string, ExamDurationRow[]>();
 for(const row of rows) {const k=JSON.stringify([row.radiographer_id,row.radiographer_name]);people.set(k,[...(people.get(k)||[]),row]);}
 const result = [];
 for(const person of people.values()) {
  for(const def of workloadDurationDefinitions.filter(d=>!selectedKey||d.key===selectedKey)) {
   if(!person.some(r=>r.category===def.category))continue;
   const countRows=person.filter(def.counts);
   let timedRows=person.filter(def.timing);
   let timeBasis=def.timeBasis;
   if(def.key.startsWith('us')&&def.key!=='us'&&def.key!=='usFibrosis'&&timedRows.length===0) {
    timedRows=countRows;timeBasis='獨立單項開始至完成';
   }
   const stats=summarizeExamDurations(timedRows);
   const plannedStats=summarizeExamDurations(person.filter(r=>r.metric_scope==='planned'&&def.timing({...r,metric_scope:'flow'})));
   const allocationApplicable=!def.label.includes('後處理');
   const allocated=summarizeExamDurations(person.filter(r=>{
    if(def.key==='usFibrosis')return false;
    if(!allocationApplicable||r.metric_scope!=='allocated'||r.category!==def.category)return false;
    const parts=r.exam_name.split('｜');
    if(def.key==='ctGeneral')return parts[1]!=='CTA流程';
    if(def.key==='cta')return parts[1]==='CTA流程';
    if(def.key.startsWith('us')&&def.key!=='us')return getUsDurationSubtype(parts.slice(2).join('｜'))===def.key;
    if(def.key.startsWith('mr')&&def.key!=='mr')return def.timing({...r,metric_scope:'flow',exam_name:`MR 整次｜${parts[1]}`});
    return true;
   }));
   result.push({ key:JSON.stringify([person[0].radiographer_id,person[0].radiographer_name,def.key]),
    radiographer_id:person[0].radiographer_id,radiographer_name:person[0].radiographer_name,category:def.category,fieldKey:def.key,label:def.label,
    quantity:countRows.reduce((s,r)=>s+r.total_count,0),quantityUnit:def.unit,timeBasis,...stats,
    plannedAverageMinutes:plannedStats.averageMinutes,plannedSampleCount:plannedStats.valid_count,
    allocatedAverageMinutes:allocated.averageMinutes,allocatedOrderCount:allocated.valid_count,allocationApplicable,
    note:def.key==='usFibrosis'?'僅保留檢查量，不列入耗時':stats.valid_count===0 ? (def.label.includes('後處理') ? '未記錄有效後處理時間' : def.category==='US'&&def.key!=='us' ? '缺少獨立單項計時' : countRows.length?'沒有有效時間紀錄':'本期無紀錄') : def.category==='MR'&&stats.valid_count<2 ? '樣本數不足' : stats.valid_count<10 ? '可供參考' : stats.validRate<0.8 ? '僅部分紀錄有有效時間' : '可供參考',
   });
  }
 }
 return result.sort((a,b)=>a.radiographer_name.localeCompare(b.radiographer_name,'zh-Hant')||workloadDurationDefinitions.findIndex(d=>d.key===a.fieldKey)-workloadDurationDefinitions.findIndex(d=>d.key===b.fieldKey));
}
