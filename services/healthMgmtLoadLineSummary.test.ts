import {it,expect} from 'vitest';
import {formatHealthMgmtSlotLineSummary,healthMgmtPendingQuestion} from './healthMgmtLoadLineSummary';
import {calculateHealthMgmtCapacity,normalizeHealthMgmtReportOrders,type HMLoadSnapshot} from './healthMgmtLoad';
const snapshot:HMLoadSnapshot={exam_date:'2026-11-13',location:'大直',counts:{consultation:23,preparation:23,basicA:16,slitLamp:2,nasopharyngoscopy:1,hearing:16,lung:6,abi:4,hrv:8,pap:5,hpv:0,carbon13:0},customer_count:23,source_count:100,unmapped_count:1,missing_identity_count:0,fallback_identity_count:0,items:[{name:'新增未分類醫令',category:'檢備',kind:'unmapped',key:null,order_count:16}],algorithm:'hm-slots-v1',synced_at:'2026-11-13T00:00:00Z'};
const capacity=()=>calculateHealthMgmtCapacity('2026-11-13','大直',Array.from({length:7},(_,i)=>({id:String(i),userId:String(i),date:'2026-11-13',station:'H',location:'大直'})),Array.from({length:7},(_,i)=>({id:String(i),name:String(i),isActive:true,location:'大直'})));
it('explains each slot calculation and the same campus total/capacity/rate as the load display',()=>{
 const text=formatHealthMgmtSlotLineSummary('2026-11-13',[{location:'大直',synced:true,snapshot,capacity:capacity()}]);
 expect(text).toContain('健管 Slot 計算');expect(text).toContain('檢備：23組 × 2＝46 slot');expect(text).toContain('基礎 A：16組 × 1.5＝24 slot');
 expect(text).toContain('需求 S 合計：141 slot');expect(text).toContain('人力 T：7人 × 30＝210 slot');expect(text).toContain('141／210＝67.1%（待確認）');
 expect(text).toContain('新增未分類醫令 16筆：是否納入 H／HA 工作');expect(text).toContain('尚未計入 S');
});
it('separates campuses and keeps missing synchronization/zero staffing distinct',()=>{
 const empty=calculateHealthMgmtCapacity('2026-11-13','北投',[],[]);
 const text=formatHealthMgmtSlotLineSummary('2026-11-13',[{location:'北投',synced:false,capacity:empty},{location:'大直',synced:true,snapshot,capacity:empty}]);
 expect(text).toContain('【北投】\n需求 S：尚未同步，不能視為零');expect(text).toContain('【大直】');expect(text).toContain('負載：無可用人力');expect(text).not.toContain('Infinity');
});
it('asks the exact mapping or time decision needed instead of only labeling an item pending',()=>{
expect(healthMgmtPendingQuestion('新增未分類醫令')).toContain('每位標準分鐘');
});
it('keeps health-management demand independent of radiographer and administrative workload fields',()=>{
 const text=formatHealthMgmtSlotLineSummary('2026-11-13',[{location:'大直',synced:true,snapshot:{...snapshot,counts:{...snapshot.counts,mr:1000,ct:1000,us_a:1000,administrative:1000}},capacity:capacity()}]);
 expect(text).toContain('健管 Slot 計算（H／HA）');expect(text).toContain('需求 S 合計：141 slot');expect(text).toContain('人力 T：7人 × 30＝210 slot');
 expect(text).not.toContain('MR');expect(text).not.toContain('CT');expect(text).not.toContain('48 slot');
});
it('does not show a pending-demand warning when all captured items are classified',()=>{
 const text=formatHealthMgmtSlotLineSummary('2026-11-13',[{location:'大直',synced:true,snapshot:{...snapshot,unmapped_count:0,items:[]},capacity:capacity()}]);
 expect(text).not.toContain('待確認醫令');expect(text).not.toContain('需求低估');
});

it('removes confirmed report-only items from legacy pending counts without changing S, and labels them in LINE',()=>{
 const before={...snapshot,unmapped_count:6,items:[{name:'眼科檢查',category:'OphC',kind:'unmapped' as const,key:null,order_count:6}]};
 const normalized=normalizeHealthMgmtReportOrders(before);
 expect(normalized.unmapped_count).toBe(0);expect(normalized.counts).toEqual(before.counts);expect(before.unmapped_count).toBe(6);
 const text=formatHealthMgmtSlotLineSummary('2026-11-13',[{location:'大直',synced:true,snapshot:before,capacity:capacity()}]);
 expect(text).toContain('報告用醫令（不計 Slot）：眼科檢查 6筆');expect(text).not.toContain('待確認醫令');expect(text).toContain('需求 S 合計：141 slot');
 expect(normalizeHealthMgmtReportOrders(normalized).unmapped_count).toBe(0);
});

it('includes the confirmed HPV/carbon13 slots and rejects old snapshots lacking the new customer counts',()=>{
 const current={...snapshot,counts:{...snapshot.counts,hpv:3,carbon13:2},unmapped_count:0,items:[]};
 const text=formatHealthMgmtSlotLineSummary('2026-11-13',[{location:'大直',synced:true,snapshot:current,capacity:capacity()}]);
 expect(text).toContain('HPV：3組 × 1＝3 slot');expect(text).toContain('碳13：2組 × 4＝8 slot');expect(text).toContain('需求 S 合計：152 slot');
 const old={...snapshot,counts:{preparation:23}};
 expect(formatHealthMgmtSlotLineSummary('2026-11-13',[{location:'大直',synced:true,snapshot:old,capacity:capacity()}])).toContain('需求 S：尚未同步');
});
