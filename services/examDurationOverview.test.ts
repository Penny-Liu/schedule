import {it,expect} from 'vitest';
import {buildDurationOverview,getDurationWorkState,formatDurationOverviewReport} from './examDurationOverview';
import type {DurationComparison} from './examDurationComparison';
const row=(changes:Partial<DurationComparison>={}):DurationComparison=>({radiographer_id:changes.radiographer_name||'甲',key:JSON.stringify([changes.radiographer_name||'甲',changes.fieldKey||'usA']),radiographer_name:'甲',category:'US',fieldKey:'usA',label:'腹',eligible:true,comparable:true,value:5,flowCount:12,sampleCount:12,sampleUnit:'項',coverage:1,reference:'樣本較充足',durationZone:'normal',comparisonUnit:'分／醫令',...changes} as DurationComparison);
it('suggests understanding slower work without labelling an employee as poor quality',()=>{
 expect(getDurationWorkState(row({durationZone:'slower'}))).toBe('attention');
 expect(getDurationWorkState(row({durationZone:'faster'}))).toBe('normal');
 const text=formatDurationOverviewReport([row({durationZone:'slower'})],'本週','北投');
 expect(text).toContain('超出標準，建議了解');expect(text).toContain('品質尚未串接');expect(text).not.toContain('表現差');expect(text).not.toContain('好又快');
});
it('shows one valid order as observation rather than concluding an employee needs help',()=>{
 const r=row({flowCount:1,sampleCount:1,durationZone:'slower',value:20});
 expect(getDurationWorkState(r)).toBe('observe');expect(formatDurationOverviewReport([r],'本週','')).toContain('20.0分／醫令');
});
it('separates incomplete or insufficient data from support needs',()=>{
 for(const changes of [{eligible:false},{coverage:.4},{value:null}])expect(getDurationWorkState(row({...changes,durationZone:'slower'}))).toBe('data');
 expect(getDurationWorkState(row({comparable:false}))).toBe('observe');
});
it('keeps the same person in different states for different exams and always orders names alphabetically',()=>{
 const rows=[row({radiographer_name:'乙',value:20,durationZone:'slower'}),row({radiographer_name:'甲',value:3,durationZone:'faster'}),row({radiographer_name:'甲',fieldKey:'usBreast',label:'乳',durationZone:'slower'})];
 const people=buildDurationOverview(rows);
 expect(people.map(p=>p.name)).toEqual(['甲','乙'].sort((a,b)=>a.localeCompare(b,'zh-Hant')));
 const a=people.find(p=>p.name==='甲')!;expect(a.states.attention).toHaveLength(1);expect(a.states.normal).toHaveLength(1);
 const changed=buildDurationOverview(rows.map(r=>({...r,value:100-r.value!})));
 expect(changed.map(p=>p.name)).toEqual(people.map(p=>p.name));
});

it('retains provisional status from synced records while preserving the incomplete-period context',()=>{
 const r=row({reference:'期間未完整同步',durationZone:'slower'});
 expect(getDurationWorkState(r)).toBe('attention');
 expect(formatDurationOverviewReport([r],'本週','1天未同步')).toContain('1天未同步');
});
it('does not count shared or unassigned records as individual colleagues',()=>{
 expect(buildDurationOverview([row({radiographer_id:'',radiographer_name:'多人共同（未拆分）'})])).toHaveLength(0);
});
