import { describe, expect, it } from 'vitest';
import { groupWorkloadDurations, getUsDurationSubtype, workloadDurationDefinitions } from './workloadDurationGroups';
import type { ExamDurationRow } from './radiographerExamDuration';
const row=(changes:Partial<ExamDurationRow>={}):ExamDurationRow=>({metric_scope:'flow',exam_date:'2026-10-01',radiographer_id:'s1',radiographer_name:'甲',category:'MR',exam_name:'MR 整次｜中型套（4～6 項）・女',location:'北投',resource_name:'MR1',total_count:1,valid_count:1,missing_time_count:0,invalid_time_count:0,zero_count:0,negative_count:0,shared_interval_count:0,duplicate_count:0,outlier_count:0,missing_staff_count:0,duration_histogram:{'600':1},synced_at:'2026-11-05T00:00:00Z',algorithm:'actual-flow-v2',...changes});
describe('workload-aligned exam-duration classification',()=>{
 it('uses the workload labels and their fixed order',()=>{
  expect(workloadDurationDefinitions.slice(0,7).map(d=>d.label)).toEqual(['MR醫令數','MR大男','MR大女','MR大女（未含乳房）','MR中','MR小','MR後處理']);
 });
 it('merges gender, room and site for medium MR instead of fragmenting samples',()=>{
  const rows=[row(),row({exam_name:'MR 整次｜中型套（4～6 項）・男',resource_name:'MR2',location:'大直',duration_histogram:{'1200':1}})];
  const [g]=groupWorkloadDurations(rows,'mrMedium');
  expect(g.quantity).toBe(2);expect(g.valid_count).toBe(2);expect(g.averageMinutes).toBe(15);expect(g.note).toBe('可供參考');
 });
 it('keeps large male and female separate',()=>{
  const rows=[row({exam_name:'MR 整次｜大型套（7 項以上）・男'}),row({exam_name:'MR 整次｜大型套（7 項以上）・女'})];
  expect(groupWorkloadDurations(rows,'mrLargeMale')[0].quantity).toBe(1);
  expect(groupWorkloadDurations(rows,'mrLargeFemale')[0].quantity).toBe(1);
 });
 it('counts MR medical orders while calculating its total time per flow',()=>{
  const rows=[row(),row({metric_scope:'item',exam_name:'頭部磁振造影',total_count:4,valid_count:0,zero_count:4,duration_histogram:{}})];
  const [g]=groupWorkloadDurations(rows,'mr');expect(g.quantity).toBe(4);expect(g.valid_count).toBe(1);expect(g.averageMinutes).toBe(10);
 });
 it('does not allocate a combined ultrasound flow to individual body parts',()=>{
  const rows=[row({category:'US',exam_name:'US 整次｜腹部超音波＋乳房超音波'}),row({category:'US',metric_scope:'item',exam_name:'腹部超音波',valid_count:0,zero_count:1,duration_histogram:{}})];
  const [abdomen]=groupWorkloadDurations(rows,'usA');expect(abdomen.quantity).toBe(1);expect(abdomen.averageMinutes).toBeNull();
  expect(groupWorkloadDurations(rows,'us')[0].averageMinutes).toBe(10);
 });
 it('can use a single-body-part ultrasound flow for that workload subtype',()=>{
  const rows=[row({category:'US',exam_name:'US 整次｜腹部超音波'})];
  expect(groupWorkloadDurations(rows,'usA')[0].averageMinutes).toBe(10);
 });
 it('does not mix postprocessing time into MR or CT flow totals',()=>{
  const rows=[row(),row({metric_scope:'item',exam_name:'MR後處理',duration_histogram:{'120':1}})];
  expect(groupWorkloadDurations(rows,'mrPostProcessing')[0].averageMinutes).toBe(2);
  expect(groupWorkloadDurations(rows,'mr')[0].averageMinutes).toBe(10);
 });
 it('uses the same ultrasound subtype priority as the workload sync',()=>{
  expect(getUsDurationSubtype('頸動脈超音波')).toBe('usCCA');expect(getUsDurationSubtype('肝纖維超音波')).toBe('usFibrosis');expect(getUsDurationSubtype('骨盆(女)')).toBe('usPelvisFemale');
 });
});

it('weights allocated averages by order count and keeps original flow mean independent',()=>{
 const rows=[row(),row({metric_scope:'allocated',exam_name:'MR 均攤｜中型套（4～6 項）・女｜頭部',total_count:6,valid_count:6,duration_histogram:{'600':6}}),row({metric_scope:'allocated',exam_name:'MR 均攤｜小型套（1～3 項）・女｜頭部',duration_histogram:{'1200':1}})];
 const g=groupWorkloadDurations(rows,'mr')[0];
 expect(g.allocatedOrderCount).toBe(7);expect(g.allocatedAverageMinutes).toBeCloseTo(80/7);expect(g.averageMinutes).toBe(10);
 expect(groupWorkloadDurations(rows,'mrMedium')[0].allocatedOrderCount).toBe(6);
});
it('shows mixed US estimates without manufacturing original single-item time',()=>{
 const g=groupWorkloadDurations([row({metric_scope:'allocated',category:'US',exam_name:'US 均攤｜單次流程｜腹部超音波'})],'usA')[0];
 expect(g.averageMinutes).toBeNull();expect(g.allocatedAverageMinutes).toBe(10);
 expect(groupWorkloadDurations([row({metric_scope:'item',exam_name:'MR後處理'})],'mrPostProcessing')[0].allocationApplicable).toBe(false);
});

it('keeps female packages with and without breast separate and shows planned time separately',()=>{
 const rows=[row({exam_name:'MR 整次｜大型套（7 項以上）・女',duration_histogram:{'4800':1}}),row({exam_name:'MR 整次｜大型套（未含乳房）・女',duration_histogram:{'3000':1}}),row({metric_scope:'planned',exam_name:'MR 整次｜大型套（7 項以上）・女',duration_histogram:{'5400':1}})];
 const withBreast=groupWorkloadDurations(rows,'mrLargeFemale')[0];
 expect(withBreast.quantity).toBe(1);expect(withBreast.averageMinutes).toBe(80);expect(withBreast.plannedAverageMinutes).toBe(90);
 expect(groupWorkloadDurations(rows,'mrLargeFemaleNoBreast')[0].averageMinutes).toBe(50);
});
it('keeps fibrosis volume but excludes it from US duration volume and all timing',()=>{
 const rows=[row({metric_scope:'item',category:'US',exam_name:'肝纖維超音波',total_count:2}),row({metric_scope:'item',category:'US',exam_name:'腹部超音波',total_count:3}),row({metric_scope:'flow',category:'US',exam_name:'US 整次｜肝纖維超音波'})];
 const us=groupWorkloadDurations(rows,'us')[0];expect(us.quantity).toBe(3);expect(us.valid_count).toBe(0);
 const fibrosis=groupWorkloadDurations(rows,'usFibrosis')[0];expect(fibrosis.quantity).toBe(2);expect(fibrosis.averageMinutes).toBeNull();expect(fibrosis.allocatedAverageMinutes).toBeNull();
});
