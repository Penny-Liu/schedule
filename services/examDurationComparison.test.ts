import {it,expect} from 'vitest';
import {buildDurationComparison,formatDurationDifference} from './examDurationComparison';
import type {ExamDurationRow} from './radiographerExamDuration';
const row=(changes:Partial<ExamDurationRow>={}):ExamDurationRow=>({metric_scope:'allocated',exam_date:'2026-10-01',radiographer_id:'a',radiographer_name:'甲',category:'US',exam_name:'US 均攤｜單次流程｜腹部',location:'北投',resource_name:'US1',total_count:20,valid_count:20,missing_time_count:0,invalid_time_count:0,zero_count:0,negative_count:0,shared_interval_count:0,duplicate_count:0,outlier_count:0,missing_staff_count:0,duration_histogram:{'300':20},synced_at:'2026-11-05',algorithm:'actual-flow-v2',...changes});
it('does not treat many medical orders in one flow as independent evidence',()=>{
 const r=buildDurationComparison([row(),row({metric_scope:'allocation_flow',exam_name:'US 來源｜單次流程｜usA',total_count:1,valid_count:1,duration_histogram:{'6000':1}}),row({metric_scope:'item',exam_name:'腹部',total_count:20,valid_count:0,duration_histogram:{}})],'usA')[0];
 expect(r.sampleCount).toBe(20);expect(r.flowCount).toBe(1);expect(r.coverage).toBe(1);expect(r.reference).toBe('可供參考');expect(r.eligible).toBe(true);
});
it('pools the department by sample counts instead of averaging staff averages',()=>{
 const r=buildDurationComparison([row({total_count:6,valid_count:6,duration_histogram:{'600':6}}),row({radiographer_id:'b',radiographer_name:'乙',total_count:1,valid_count:1,duration_histogram:{'1200':1}})],'us')[0];
 expect(r.benchmark).toBeCloseTo(80/7);expect(r.benchmarkSamples).toBe(7);expect(r.benchmarkPeople).toBe(2);
});
it('uses per-flow MR metrics and excludes allocated orders from its reference denominator',()=>{
 const r=buildDurationComparison([row({metric_scope:'flow',category:'MR',exam_name:'MR 整次｜中型套（4～6 項）・女',total_count:12,valid_count:12,duration_histogram:{'3600':12}}),row({category:'MR',exam_name:'MR 均攤｜中型套（4～6 項）・女｜頭部'})],'mrMedium')[0];
 expect(r.value).toBe(60);expect(r.sampleCount).toBe(12);expect(r.reference).toBe('樣本較充足');expect(r.comparisonUnit).toBe('分／次');
});
it('flags missing coverage and incomplete sync without hiding valid values',()=>{
 const rows=[row(),row({metric_scope:'item',exam_name:'腹部',total_count:40,valid_count:0,duration_histogram:{}}),row({metric_scope:'allocation_flow',exam_name:'US 來源｜單次流程｜全部',valid_count:10,total_count:10,duration_histogram:{'600':10}})];
 expect(buildDurationComparison(rows,'us')[0].reference).toBe('資料覆蓋偏低');
 rows[1].total_count=20;
 expect(buildDurationComparison(rows,'us',true)[0].reference).toBe('期間未完整同步');
 expect(buildDurationComparison(rows,'us',true)[0].value).toBe(5);
});

it('requires two MR source flows even when a single flow contains many medical orders',()=>{
 const rows=[row({category:'MR',exam_name:'MR 均攤｜大型套（7 項以上）・男｜頭部',total_count:8,valid_count:8,duration_histogram:{'600':8}}),row({category:'MR',metric_scope:'allocation_flow',exam_name:'MR 來源｜大型套（7 項以上）・男｜全部',total_count:1,valid_count:1,duration_histogram:{'4800':1}})];
 const r=buildDurationComparison(rows,'mr')[0];
 expect(r.flowCount).toBe(1);expect(r.eligible).toBe(false);expect(r.reference).toBe('樣本數不足');expect(r.comparable).toBe(false);expect(r.benchmark).toBeNull();
});
it('includes MR at exactly two flows and excludes insufficient staff from its weighted average',()=>{
 const records=[['甲',2,1800],['乙',2,3600],['不足',1,600]].map(([name,n,seconds])=>row({radiographer_id:String(name),radiographer_name:String(name),metric_scope:'flow',category:'MR',exam_name:'MR 整次｜小型套（1～3 項）・女',total_count:Number(n),valid_count:Number(n),duration_histogram:{[String(seconds)]:Number(n)}}));
 const all=buildDurationComparison(records,'mrSmall');
 const entries=['甲','乙','不足'].map(name=>all.find(r=>r.radiographer_name===name)!);
 expect(entries[0].benchmark).toBe(45);expect(entries[0].benchmarkPeople).toBe(2);expect(entries[0].comparable).toBe(true);expect(entries[0].differenceMinutes).toBe(-15);
 expect(formatDurationDifference(entries[0])).toBe('低於全科平均 15.0 分');
 expect(formatDurationDifference(entries[1])).toBe('高於全科平均 15.0 分');
 expect(entries[2].comparable).toBe(false);
});
it('shows a single valid US or CT order but needs another person for comparison',()=>{
 for(const category of ['US','CT']) {
  const rows=[row({category,total_count:1,valid_count:1,exam_name:`${category} 均攤｜單次流程｜腹部`,duration_histogram:{'300':1}})];
  const r=buildDurationComparison(rows,category.toLowerCase())[0];
  expect(r.eligible).toBe(true);expect(r.value).toBe(5);expect(r.comparable).toBe(false);expect(formatDurationDifference(r)).toBe('無其他人員可比較');
  rows.push({...rows[0],radiographer_id:'b',radiographer_name:'乙',duration_histogram:{'600':1}});
  const compared=buildDurationComparison(rows,category.toLowerCase())[0];
  expect(compared.comparable).toBe(true);expect(compared.benchmark).toBe(7.5);
 }
});
