import {it,expect} from 'vitest';
import {formatDurationCareNote} from './examDurationCareNote';
import {summarizeExamDurations} from './examDurationMetrics';
import {buildDurationCardPages} from './examDurationReportCard';
import {formatExamDurationLineSummary} from './examDurationLineSummary';
import {buildDurationComparison} from './examDurationComparison';
import type {ExamDurationRow} from './radiographerExamDuration';
const row=(changes:Partial<ExamDurationRow>={}):ExamDurationRow=>({metric_scope:'allocation_flow',exam_date:'2026-11-06',radiographer_id:'a',radiographer_name:'甲',category:'MR',exam_name:'MR 來源｜小型套（1～3 項）・男｜全部',valid_count:1,total_count:1,duration_histogram:{'1800':1},claustrophobia_count:1,...changes} as ExamDurationRow);
it('keeps uncaptured snapshots distinct from a confirmed zero and marks partial capture',()=>{
 expect(summarizeExamDurations([row({claustrophobia_count:undefined})]).claustrophobiaCount).toBeNull();
 const stats=summarizeExamDurations([row(),row({claustrophobia_count:null})]);
 expect(stats.careNotesComplete).toBe(false);expect(stats.claustrophobiaCount).toBe(1);
 expect(formatDurationCareNote({category:'MR',fieldKey:'mr',...stats})).toBe('關懷：幽閉 1 次（部分資料）');
 expect(formatDurationCareNote({category:'MR',fieldKey:'mr',claustrophobiaCount:0,careNotesComplete:true})).toBe('');
 expect(formatDurationCareNote({category:'MR',fieldKey:'mr',claustrophobiaCount:null})).toBe('關懷註記待同步');
 expect(formatDurationCareNote({category:'US',fieldKey:'us',...stats})).toBe('');
});
it('uses independent source flow counts rather than counts of allocated medical orders',()=>{
 const rows=[row(),row({metric_scope:'allocated',exam_name:'MR 均攤｜小型套（1～3 項）・男｜頭部',valid_count:3,total_count:3,claustrophobia_count:3,duration_histogram:{'600':3}})];
 const entry=buildDurationComparison(rows,'mr')[0];
 expect(entry.claustrophobiaCount).toBe(1);expect(entry.careNotesComplete).toBe(true);
 expect(entry.value).toBe(10);expect(entry.sampleCount).toBe(3);
});

it('includes the care annotation in both the image model and LINE text',()=>{
 const flow=row({metric_scope:'flow',exam_name:'MR 整次｜小型套（1～3 項）・男',valid_count:2,total_count:2,duration_histogram:{'1800':2}});
 const entries=buildDurationComparison([flow],'mrSmall');
 const pages=buildDurationCardPages(entries,{mode:'category',fieldKey:'mrSmall',staff:'',period:'本期',filters:'全部'});
 expect(pages[0].rows[0].careNote).toBe('關懷：幽閉 1 次');
 expect(formatExamDurationLineSummary({rows:entries,period:'本期',filters:''})).toContain('關懷：幽閉 1 次');
});
