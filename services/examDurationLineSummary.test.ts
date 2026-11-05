import {it,expect} from 'vitest';
import {sortDurationPeople,sortDurationRows,formatExamDurationLineSummary} from './examDurationLineSummary';
import type {DurationComparison} from './examDurationComparison';
const row=(changes:Partial<DurationComparison>={}):DurationComparison=>({radiographer_name:'甲',fieldKey:'usA',category:'US',label:'腹',value:5,basis:'均攤估計',quantity:20,quantityUnit:'醫令',sampleCount:18,sampleUnit:'項',flowCount:12,coverage:.9,benchmark:6,referenceMedian:6,durationZone:'normal',benchmarkSamples:40,benchmarkPeople:2,comparisonUnit:'分／醫令',reference:'樣本較充足',eligible:true,comparable:true,key:JSON.stringify([changes.radiographer_name||'甲',changes.fieldKey||'usA']),...changes} as DurationComparison);
it('sorts department by a chosen exam and always puts missing values last',()=>{
 const rows=[row({radiographer_name:'甲',value:10}),row({radiographer_name:'乙',value:5}),row({radiographer_name:'丙',value:null}),row({radiographer_name:'丁',fieldKey:'mrSmall',value:1})];
 expect(sortDurationPeople(rows,'usA','value','asc').slice(0,2)).toEqual(['乙','甲']);
 expect(sortDurationPeople(rows,'usA','value','desc').slice(0,2)).toEqual(['甲','乙']);
 expect(sortDurationPeople(rows,'mrSmall','value','asc')[0]).toBe('丁');
});
it('sorts personal classifications by counts without mutating the inputs',()=>{
 const rows=[row({fieldKey:'usA',flowCount:2}),row({fieldKey:'usBreast',flowCount:10})];
 expect(sortDurationRows(rows,'flowCount','desc')[0].fieldKey).toBe('usBreast');
 expect(rows[0].fieldKey).toBe('usA');
 expect(sortDurationRows(rows,'name','asc')[0].fieldKey).toBe('usA');
});
it('exports only category average, time order and names, omitting insufficient records',()=>{
 const text=formatExamDurationLineSummary({rows:[row({radiographer_name:'甲',value:7}),row({radiographer_name:'乙',value:5}),row({radiographer_name:'不足',comparable:false,eligible:false,value:4})],period:'2026-10-04～2026-11-02',filters:'院區：北投'});
 expect(text).toContain('US・腹｜參考中位數 6.0分／醫令');
 expect(text).toContain('・乙 5.0分｜正常');expect(text).toContain('・甲 7.0分｜正常');
 expect(text).not.toContain('不足');expect(text).not.toContain('來源');expect(text).not.toContain('覆蓋');expect(text).not.toContain('有效');
});
it('keeps the department rank when exporting just one person',()=>{
 const peers=[row({radiographer_name:'甲',value:7}),row({radiographer_name:'乙',value:5})];
 const text=formatExamDurationLineSummary({rows:[peers[0]],rankingRows:peers,period:'今日',filters:''});
 expect(text).toContain('・甲 7.0分｜正常');expect(text).not.toContain('乙 5.0分');
});
it('omits noncomparable categories and uses equal ranks for equal displayed times',()=>{
 expect(formatExamDurationLineSummary({rows:[row({comparable:false})],period:'今日',filters:''})).toBe('');
 const text=formatExamDurationLineSummary({rows:[row({radiographer_name:'甲',value:5.01}),row({radiographer_name:'乙',value:5.02}),row({radiographer_name:'丙',value:6})],period:'今日',filters:''});
 expect(text).toContain('・甲 5.0分｜正常');expect(text).toContain('・乙 5.0分｜正常');expect(text).toContain('・丙 6.0分｜正常');
});
it('sorts insufficient MR after eligible times in both directions',()=>{
 const rows=[row({radiographer_name:'甲',value:30,eligible:false}),row({radiographer_name:'乙',value:60})];
 expect(sortDurationPeople(rows,'usA','value','asc')[0]).toBe('乙');
 expect(sortDurationPeople(rows,'usA','value','desc')[0]).toBe('乙');
});
