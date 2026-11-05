import type { ExamDurationRow } from './radiographerExamDuration';
import { groupWorkloadDurations } from './workloadDurationGroups';
import { summarizeExamDurations } from './examDurationMetrics';

export function buildDurationComparison(rows: ExamDurationRow[], selectedKey = '', incomplete = false) {
  const groups = groupWorkloadDurations(rows, selectedKey);
  const entries = groups.map(group => {
    const perFlow = ['mrLargeMale','mrLargeFemale','mrLargeFemaleNoBreast','mrMedium','mrSmall','cta'].includes(group.fieldKey);
    const original = perFlow || !group.allocationApplicable;
    const sourceRows = rows.filter(r => {
      if(r.radiographer_id!==group.radiographer_id || r.radiographer_name!==group.radiographer_name || r.category!==group.category || r.metric_scope!=='allocation_flow')return false;
      const [, label, subtype] = r.exam_name.split('｜');
      if(group.fieldKey.startsWith('us') && group.fieldKey!=='us')return subtype===group.fieldKey;
      if(subtype!=='全部')return false;
      if(group.fieldKey==='cta')return label==='CTA流程';
      if(group.fieldKey==='mrMedium')return label.includes('中型套');
      if(group.fieldKey==='mrSmall')return label.includes('小型套');
      if(group.fieldKey==='mrLargeMale')return label.includes('大型套')&&/・(男|M|Male)$/i.test(label);
      if(group.fieldKey==='mrLargeFemaleNoBreast')return label.includes('大型套（未含乳房）')&&/・(女|F|Female)$/i.test(label);
      if(group.fieldKey==='mrLargeFemale')return label.includes('大型套（7 項以上）')&&/・(女|F|Female)$/i.test(label);
      return true;
    });
    const flowCount = original ? group.valid_count : summarizeExamDurations(sourceRows).valid_count;
    const sampleCount = original ? group.valid_count : group.allocatedOrderCount;
    const coverage = group.quantity ? Math.min(1,sampleCount/group.quantity) : 0;
    const value = original ? group.averageMinutes : group.allocatedAverageMinutes;
    const basis = !group.allocationApplicable ? '後處理實測' : perFlow ? '整次流程' : '均攤估計';
    const eligible=value!==null && sampleCount>0 && (group.category!=='MR'||flowCount>=2);
    const reference = value===null ? '無可用時間' : !eligible ? '樣本數不足' : flowCount===0 ? '來源流程待同步' : coverage<0.8 ? '資料覆蓋偏低' : incomplete ? '期間未完整同步' : flowCount<10 ? '可供參考' : '樣本較充足';
    return {...group,eligible,value,basis,flowCount,sampleCount,coverage,reference,sampleUnit:original?'次':'項',comparisonUnit:original?'分／次':'分／醫令'};
  });
  // 全科參考從總時間／總有效樣本計算，不能直接平均每位同仁的平均。
  return entries.map(entry=>{
    const peers=entries.filter(e=>e.fieldKey===entry.fieldKey&&e.basis===entry.basis&&e.eligible);
    const benchmarkSamples=peers.reduce((n,e)=>n+e.sampleCount,0);
    const benchmark=benchmarkSamples?peers.reduce((n,e)=>n+e.value!*e.sampleCount,0)/benchmarkSamples:null;
    const referenceValues=peers.map(e=>e.value!).sort((a,b)=>a-b);
    const referenceMedian=median(referenceValues);
    const mad=referenceMedian===null?null:median(referenceValues.map(value=>Math.abs(value-referenceMedian)));
    const sensitivityFloor=referenceMedian===null?0:referenceMedian*0.1;
    const threshold=Math.max(mad||0,sensitivityFloor);
    const robustLower=referenceMedian===null?null:referenceMedian-threshold;
    const robustUpper=referenceMedian===null?null:referenceMedian+threshold;
    const comparable=entry.eligible&&benchmark!==null&&peers.length>=3;
    const durationZone=!comparable||entry.value===null?'insufficient'
      :entry.value<robustLower!?'faster'
      :entry.value>robustUpper!?'slower':'normal';
    const differenceMinutes=comparable?entry.value!-benchmark!:null;
    const differencePercent=comparable&&benchmark!>0?differenceMinutes!/benchmark!*100:null;
    return {...entry,benchmark,benchmarkSamples,benchmarkPeople:peers.length,benchmarkFlows:peers.reduce((n,e)=>n+e.flowCount,0),comparable,differenceMinutes,differencePercent,referenceMedian,mad,robustLower,robustUpper,durationZone};
  });
}
export type DurationComparison = ReturnType<typeof buildDurationComparison>[number];

const median=(values:number[])=>{
  if(!values.length)return null;
  const middle=Math.floor(values.length/2);
  return values.length%2?values[middle]:(values[middle-1]+values[middle])/2;
};

export function formatDurationDifference(entry: Pick<DurationComparison,'eligible'|'comparable'|'differenceMinutes'|'differencePercent'|'reference'|'value'|'benchmark'|'durationZone'|'robustLower'|'robustUpper'|'referenceMedian'>) {
 if(!entry.eligible)return entry.reference;
 if(!entry.comparable || entry.differenceMinutes===null)return '無其他人員可比較';
 if(entry.durationZone==='faster')return '偏快區間';
 if(entry.durationZone==='slower')return '偏慢區間';
 return '在正常變異範圍內';
}
