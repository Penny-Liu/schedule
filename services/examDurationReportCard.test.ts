import {it,expect} from 'vitest';
import {buildDurationCardPages} from './examDurationReportCard';
import type {DurationComparison} from './examDurationComparison';
const row=(changes:Partial<DurationComparison>={}):DurationComparison=>({key:'a',radiographer_id:'a',radiographer_name:'同仁甲',fieldKey:'usA',category:'US',label:'腹',value:12,standardMinutes:15,standardDifferenceMinutes:-3,sampleCount:20,sampleUnit:'項',flowCount:18,coverage:1,basis:'比例分攤估計',eligible:true,comparable:true,durationZone:'normal',comparisonUnit:'分／醫令',reference:'樣本較充足',...changes} as DurationComparison);
const opts={mode:'category' as const,fieldKey:'usA',staff:'',period:'2026-10-04～2026-11-02',filters:'北投｜US1｜2天未同步'};
it('splits long reports into readable pages with complete scope and no missing rows',()=>{
 const rows=Array.from({length:17},(_,i)=>row({radiographer_id:`s${i}`,radiographer_name:`同仁${String(i).padStart(2,'0')}`}));
 const pages=buildDurationCardPages(rows,opts);
 expect(pages.map(p=>p.rows.length)).toEqual([8,8,1]);expect(pages.flatMap(p=>p.rows).map(r=>r.name)).toEqual(rows.map(r=>r.radiographer_name));
 for(const p of pages){expect(p.pageCount).toBe(3);expect(p.period).toBe(opts.period);expect(p.filters).toBe(opts.filters);}
});
it('uses name order regardless of time or support status and excludes unassigned/fibrosis records',()=>{
 const rows=[row({radiographer_name:'甲',value:30,durationZone:'slower'}),row({radiographer_name:'乙',value:1}),row({radiographer_id:'',radiographer_name:'共同流程'}),row({fieldKey:'usFibrosis'})];
 const pages=buildDurationCardPages(rows,opts);
 expect(pages[0].rows.map(r=>r.name)).toEqual(['甲','乙'].sort((a,b)=>a.localeCompare(b,'zh-Hant')));expect(pages[0].rows).toHaveLength(2);
});
it('preserves mixed units, counts and insufficient samples in a personal report',()=>{
 const pages=buildDurationCardPages([row({category:'MR',fieldKey:'mrSmall',label:'MR小',eligible:false,sampleCount:1,sampleUnit:'次',flowCount:1,comparisonUnit:'分／次',reference:'樣本數不足'}),row()],{...opts,mode:'person',staff:'同仁甲'});
 expect(pages[0].rows[0].label).toBe('MR・MR小');expect(pages[0].rows[0].state).toBe('data');expect(pages[0].rows[0].unit).toBe('分／次');expect(pages[0].rows[1].unit).toBe('分／醫令');
});
it('returns no pages for an empty filter and never changes source rows',()=>{
 const rows=[row()];expect(buildDurationCardPages(rows,{...opts,fieldKey:'missing'})).toEqual([]);expect(rows[0].value).toBe(12);
});
