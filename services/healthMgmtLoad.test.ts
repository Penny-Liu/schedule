import {HM_LOAD_RULES} from './healthMgmtLoadRules.mjs';
import {it,expect} from 'vitest';
import {calculateHealthMgmtCapacity,calculateHealthMgmtLoad,isHealthMgmtSnapshotReady,hmCapacityStation,type HMLoadSnapshot} from './healthMgmtLoad';
import type {HealthMgmtShift,HealthMgmtStaff} from '../types';
const member=(id:string,changes:Partial<HealthMgmtStaff>={}):HealthMgmtStaff=>({id,name:id,isActive:true,location:'北投',...changes});
const shift=(id:string,changes:Partial<HealthMgmtShift>={}):HealthMgmtShift=>({id,userId:id,date:'2026-11-13',station:'H',location:'北投',...changes});
const capacity=(rows:HealthMgmtShift[],staff=rows.map(r=>member(r.userId)))=>calculateHealthMgmtCapacity('2026-11-13','北投',rows,staff);
it('counts only H/HA, excludes administration/controller/main controller and includes assistant controller',()=>{
 const rows=[shift('h'),shift('ha',{station:'HA班',task:'輔控'}),shift('main',{task:'主控'}),shift('control',{station:'場控'}),shift('admin',{station:'行政'}),shift('other',{station:'G'})];
 const result=capacity(rows);expect(result.staffCount).toBe(2);expect(result.supplySlots).toBe(60);expect(result.included.map(r=>r.id)).toEqual(['h','ha']);
 expect(hmCapacityStation('08:00-17:00 HA')).toBe('HA');expect(hmCapacityStation('行政')).toBeNull();
});
it('deduplicates a member in one campus and refuses assigning the same full capacity to both campuses',()=>{
 expect(capacity([shift('a'),shift('a',{id:'duplicate',station:'HA'})]).staffCount).toBe(1);
 const result=capacity([shift('a'),shift('a',{id:'other-campus',location:'大直'})]);expect(result.staffCount).toBe(0);expect(result.excluded[0].reason).toContain('跨院區');
 expect(capacity([shift('a',{location:undefined})],[member('a',{location:'全部'})]).staffCount).toBe(0);
});
it('honors hire/termination dates including the final employed date, and flags missing staff',()=>{
 const rows=[shift('future'),shift('ended'),shift('last'),shift('inactive'),shift('unknown')];
 const staff=[member('future',{hireDate:'2026-11-14'}),member('ended',{terminationDate:'2026-11-12',isActive:false}),member('last',{terminationDate:'2026-11-13',isActive:false}),member('inactive',{isActive:false})];
 expect(capacity(rows,staff).included.map(r=>r.id)).toEqual(['last']);
});
it('distinguishes unsynced data, a confirmed empty day, zero capacity, and pending lower-bound demand',()=>{
 const c=capacity([shift('a')]);const snapshot:HMLoadSnapshot={exam_date:'2026-11-13',location:'北投',counts:{preparation:20},customer_count:20,source_count:20,unmapped_count:0,missing_identity_count:0,fallback_identity_count:0,items:[],algorithm:'hm-slots-v1',synced_at:'2026-11-13T00:00:00Z'};
 expect(calculateHealthMgmtLoad(snapshot,false,c).demand).toBeNull();expect(calculateHealthMgmtLoad(undefined,true,c).demand).toBe(0);
 expect(calculateHealthMgmtLoad(snapshot,true,c).rate).toBeCloseTo(40/30*100);
 expect(calculateHealthMgmtLoad(snapshot,true,c).additionalStaff).toBe(1);
 expect(calculateHealthMgmtLoad(snapshot,true,capacity([])).status).toBe('無可用人力');
 expect(calculateHealthMgmtLoad({...snapshot,unmapped_count:1},true,c).status).toBe('資料待確認');
});
it('uses the same green/yellow/red boundaries as the radiographer position view',()=>{
 const c=capacity([shift('a')]);
 const base:HMLoadSnapshot={exam_date:'2026-11-13',location:'北投',counts:{},customer_count:0,source_count:0,unmapped_count:0,missing_identity_count:0,fallback_identity_count:0,items:[],algorithm:'hm-slots-v1',synced_at:'2026-11-13T00:00:00Z'};
 expect(calculateHealthMgmtLoad({...base,counts:{hearing:44}},true,c).status).toBe('綠區');
 expect(calculateHealthMgmtLoad({...base,counts:{hearing:45}},true,c).status).toBe('黃區');
 expect(calculateHealthMgmtLoad({...base,counts:{hearing:54}},true,c).status).toBe('黃區');
 expect(calculateHealthMgmtLoad({...base,counts:{hearing:55}},true,c).status).toBe('紅區');
});

it('does not display stale or missing campus rows as a newly synchronized zero-demand day',()=>{
 const snapshot={algorithm:'hm-slots-v1',synced_at:'2026-11-13T01:00:00Z',counts:Object.fromEntries(HM_LOAD_RULES.map(rule=>[rule.key,0]))} as HMLoadSnapshot;
 const day={exam_date:'2026-11-13',algorithm:'hm-slots-v1',synced_at:'2026-11-13T02:00:00Z'};
 expect(isHealthMgmtSnapshotReady(undefined,day)).toBe(false);expect(isHealthMgmtSnapshotReady(snapshot,day)).toBe(false);
 expect(isHealthMgmtSnapshotReady({...snapshot,synced_at:'2026-11-13T02:00:00+00:00'},day)).toBe(true);
});
it('adds H support and deduplicates full names, aliases and repeated support rows against formal staff',()=>{
 const staff=[member('a',{name:'同仁甲',alias:'小甲'}),member('b',{name:'同仁乙'})];
 const support=[{date:'2026-11-13',location:'北投',staff_names:'同仁甲、小甲，同仁乙'},{date:'2026-11-13',location:'北投',staff_names:'同仁乙'}];
 const result=calculateHealthMgmtCapacity('2026-11-13','北投',[shift('a')],staff,support);
 expect(result.staffCount).toBe(2);expect(result.supplySlots).toBe(60);expect(result.included.every(s=>s.station.includes('H支援'))).toBe(true);
});
it('keeps main controllers excluded and assistant controllers included when they also appear as H support',()=>{
 const staff=[member('main',{name:'主控同仁'}),member('assist',{name:'輔控同仁'})];
 const formal=[shift('main',{task:'主控'}),shift('assist',{task:'輔控'})];
 const result=calculateHealthMgmtCapacity('2026-11-13','北投',formal,staff,[{date:'2026-11-13',location:'北投',staff_names:'主控同仁,輔控同仁'}]);
 expect(result.included.map(s=>s.id)).toEqual(['assist']);expect(result.excluded.find(s=>s.id==='main')?.reason).toContain('主控');
});
it('flags unmapped/ambiguous support and does not allocate a matched person to two campuses',()=>{
 const staff=[member('a',{name:'同仁甲'}),member('b',{name:'同名'}),member('c',{name:'同名'})];
 const support=[{date:'2026-11-13',location:'北投',staff_names:'同仁甲,同名,未登錄'},{date:'2026-11-13',location:'大直',staff_names:'同仁甲'}];
 const result=calculateHealthMgmtCapacity('2026-11-13','北投',[],staff,support);
 expect(result.staffCount).toBe(0);expect(result.excluded).toHaveLength(3);expect(result.excluded.map(s=>s.reason).join(' ')).toContain('跨院區');
 expect(calculateHealthMgmtLoad(undefined,true,result).unknownCapacity).toBe(true);
});
it('does not guess campus for H support and respects the actual support date/category',()=>{
 const staff=[member('a',{name:'同仁甲'})];
 const missing=calculateHealthMgmtCapacity('2026-11-13','北投',[],staff,[{date:'2026-11-13',staff_names:'同仁甲'}]);expect(missing.staffCount).toBe(0);expect(missing.excluded[0].reason).toContain('未指定');
 const other=calculateHealthMgmtCapacity('2026-11-13','北投',[],staff,[{date:'2026-11-14',location:'北投',staff_names:'同仁甲'},{date:'2026-11-13',location:'北投',staff_names:'同仁甲',category:'行政'}]);expect(other.staffCount).toBe(0);
});
