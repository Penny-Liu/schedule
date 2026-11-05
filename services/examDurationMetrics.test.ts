import { describe, expect, it } from 'vitest';
import { groupExamDurations, summarizeExamDurations } from './examDurationMetrics';
import type { ExamDurationRow } from './radiographerExamDuration';
const row = (changes: Partial<ExamDurationRow> = {}): ExamDurationRow => ({
 metric_scope:'item',exam_date:'2026-10-01', radiographer_id:'s1', radiographer_name:'甲', category:'US',exam_name:'腹部',location:'北投',resource_name:'US1',total_count:1,valid_count:1,
 missing_time_count:0,invalid_time_count:0,zero_count:0,negative_count:0,shared_interval_count:0,duplicate_count:0,outlier_count:0,missing_staff_count:0,duration_histogram:{'600':1},synced_at:'2026-10-02T00:00:00Z',algorithm:'actual-item-v1',...changes,
});
describe('exam duration histogram aggregation',()=>{
 it('merges actual sample frequencies instead of averaging daily averages',()=>{
  const value=summarizeExamDurations([row(),row({exam_date:'2026-10-02',total_count:3,valid_count:3,duration_histogram:{'1200':3}})]);
  expect(value.averageMinutes).toBe(17.5);expect(value.medianMinutes).toBe(20);expect(value.valid_count).toBe(4);
 });
 it('returns no number for no valid samples and does not turn missing time into zero',()=>{
  const value=summarizeExamDurations([row({valid_count:0,missing_time_count:1,duration_histogram:{}})]);
  expect(value.averageMinutes).toBeNull();expect(value.medianMinutes).toBeNull();expect(value.reliable).toBe(false);
 });
 it('suppresses unreliable groups unless sample size and valid rate both meet thresholds',()=>{
  expect(summarizeExamDurations([row({total_count:10,valid_count:10,duration_histogram:{'600':10}})]).reliable).toBe(true);
  expect(summarizeExamDurations([row({total_count:100,valid_count:10,zero_count:90,duration_histogram:{'600':10}})]).reliable).toBe(false);
  expect(summarizeExamDurations([row()]).reliable).toBe(false);
 });
 it('separates personnel, items, sites and equipment',()=>{
  expect(groupExamDurations([row(),row({exam_date:'2026-10-02'}),row({exam_name:'乳房'}),row({resource_name:'US2'}),row({location:'大直'}),row({radiographer_id:'s2',radiographer_name:'乙'})])).toHaveLength(5);
 });
 it('keeps flow and individual-item rows separate',()=>{
  expect(groupExamDurations([row(),row({metric_scope:'flow'})])).toHaveLength(2);
 });
 it('computes even sample medians from both central observations',()=>{
  expect(summarizeExamDurations([row({total_count:2,valid_count:2,duration_histogram:{'600':1,'1200':1}})]).medianMinutes).toBe(15);
 });
});
