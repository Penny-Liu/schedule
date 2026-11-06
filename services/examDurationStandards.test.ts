import {it,expect} from 'vitest';
import {examDurationStandards,getExamStandardMinutes,resolveDurationStandard} from './examDurationStandards';
import type {ExamDurationRow} from './radiographerExamDuration';
import {buildDurationComparison} from './examDurationComparison';
const row=(changes:Partial<ExamDurationRow>={}):ExamDurationRow=>({metric_scope:'allocated',exam_date:'2026-11-05',radiographer_id:'a',radiographer_name:'甲',category:'US',exam_name:'US 均攤｜單次流程｜腹部',location:'北投',resource_name:'US1',total_count:1,valid_count:1,missing_time_count:0,invalid_time_count:0,zero_count:0,negative_count:0,shared_interval_count:0,duplicate_count:0,outlier_count:0,missing_staff_count:0,duration_histogram:{'300':1},synced_at:'2026-11-06',algorithm:'actual-flow-v3',...changes});
it('stores all 21 user-provided standards exactly',()=>{
 expect(examDurationStandards.map(s=>s.minutes)).toEqual([75,90,60,55,40,10,15,15,25,10,10,10,7,5,3,5,15,45,5,15,7]);
 expect(new Set(examDurationStandards.map(s=>s.key)).size).toBe(21);
 expect(getExamStandardMinutes('mr')).toBeNull();expect(getExamStandardMinutes('us')).toBeNull();expect(getExamStandardMinutes('ct')).toBeNull();
});
it('weights mixed US orders using actual eligible order counts',()=>{
 const rows=[row({total_count:2,valid_count:2}),row({exam_name:'US 均攤｜單次流程｜甲狀腺超音波'})];
 expect(resolveDurationStandard(rows,'us',3).standardMinutes).toBeCloseTo(40/3);
 expect(resolveDurationStandard([row({exam_name:'US 均攤｜單次流程｜未分類'})],'us',1).standardMinutes).toBeNull();
});
it('converts MR package standards to medical-order units without multiplying per-order times',()=>{
 const rows=[row({category:'MR',total_count:9,valid_count:9,exam_name:'MR 均攤｜大型套（7 項以上）・女｜部位'}),row({category:'MR',metric_scope:'allocation_flow',exam_name:'MR 來源｜大型套（7 項以上）・女｜全部'})];
 expect(resolveDurationStandard(rows,'mr',9).standardMinutes).toBe(10);
 expect(resolveDurationStandard(rows,'mrLargeFemale',1).standardMinutes).toBe(90);
});
it('keeps general CT separate from CTA and weights CTA by flow, not order count',()=>{
 const rows=[row({category:'CT',exam_name:'CT 均攤｜單次流程｜肺部',duration_histogram:{'600':1}}),row({category:'CT',exam_name:'CT 均攤｜CTA流程｜心臟',total_count:3,valid_count:3,duration_histogram:{'300':3}}),row({category:'CT',metric_scope:'allocation_flow',exam_name:'CT 來源｜單次流程｜全部'}),row({category:'CT',metric_scope:'allocation_flow',exam_name:'CT 來源｜CTA流程｜全部'})];
 expect(resolveDurationStandard(rows,'ct',4).standardMinutes).toBe(20/4);
 const general=buildDurationComparison(rows,'ctGeneral')[0];
 expect(general.quantity).toBe(1);expect(general.value).toBe(10);expect(general.standardMinutes).toBe(5);
});
it('keeps missing or incomplete combinations unconfigured rather than using a peer median',()=>{
 expect(resolveDurationStandard([row()],'us',2).standardMinutes).toBeNull();
 const unknown=buildDurationComparison([row({exam_name:'US 均攤｜單次流程｜未分類'})],'us')[0];
 expect(unknown.standardMinutes).toBeNull();expect(unknown.comparable).toBe(false);
});

it('compares at the displayed tenth of a minute so an invisible rounding difference is not flagged',()=>{
 const r=buildDurationComparison([row({duration_histogram:{'900.01':1}})],'usA')[0];
 expect(r.standardMinutes).toBe(15);expect(r.durationZone).toBe('normal');
});
it('excludes fibrosis from standard-time comparisons while preserving the original supplied value for history',()=>{
 expect(getExamStandardMinutes('usFibrosis')).toBeNull();
 expect(examDurationStandards.find(s=>s.key==='usFibrosis')?.minutes).toBe(3);
});

it('keeps fibrosis out of timing comparison and report entries',()=>{
 const entries=buildDurationComparison([row({metric_scope:'item',exam_name:'肝纖維超音波'})]);
 expect(entries.some(r=>r.fieldKey==='usFibrosis')).toBe(false);
});
