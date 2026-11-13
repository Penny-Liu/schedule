import {it,expect} from 'vitest';
import {buildHealthMgmtLoadSnapshots,completeHealthMgmtLoadDays} from './health-mgmt-load-summary.mjs';
import {healthMgmtDemandSlots,classifyHealthMgmtOrder,HM_LOAD_RULES} from '../services/healthMgmtLoadRules.mjs';
import {healthMgmtDateRange} from './sync-health-mgmt-load.mjs';
const record=(changes={})=>({Id:'r',Order__c:'order-secret',Order__r:{Contact__c:'patient-secret'},CheckupName__c:'血壓',CheckStartDate__c:'2026-11-13',Location__c:'北投',ResourceCategory__c:'檢備',Checkup_Status__c:'10',...changes});
it('counts grouped preparation/basic-A once per customer and keeps all other service buckets separate',()=>{
 const names=['護理諮詢','身高','血壓','靜態十二導程心電圖','抽血技術','色盲檢查','視力值','眼壓','電腦驗光','眼科光學斷層掃描','細隙燈檢查','鼻咽內視鏡檢查','氣導聽力檢測','肺活量、最大吐氣量','週邊血管動脈檢查ABI','自律神經檢查HRV','液基薄層抹片','子宮頸抹片檢查','人類乳突狀病毒分型','碳13-尿素呼吸試驗'];
 const rows=buildHealthMgmtLoadSnapshots(names.map((CheckupName__c,i)=>record({Id:String(i),CheckupName__c})));
 expect(rows[0].counts.preparation).toBe(1);expect(rows[0].counts.basicA).toBe(1);expect(rows[0].counts.pap).toBe(1);
 expect(Object.values(rows[0].counts)).toEqual(HM_LOAD_RULES.map(()=>1));expect(healthMgmtDemandSlots(rows[0].counts)).toBe(15.5);
 expect(rows[0].customer_count).toBe(1);
 const output=JSON.stringify(rows);expect(output).not.toContain('patient-secret');expect(output).not.toContain('order-secret');
});
it('deduplicates same customer across orders but separates campus/date and ignores invalid statuses and flow roots',()=>{
 const input=[record(),record(),record({Id:'r2',Order__c:'another'}),record({Id:'r3',Location__c:'大直'}),record({Id:'r4',CheckStartDate__c:'2026-11-14'}),record({Id:'cancelled',Checkup_Status__c:'20'}),record({Id:'flow',CheckupName__c:'流程報到',ProcessType__c:'流程報到'})];
 const rows=buildHealthMgmtLoadSnapshots(input);expect(rows).toHaveLength(3);expect(rows.map(r=>r.counts.preparation)).toEqual([1,1,1]);
});
it('keeps vague consults and unconfigured services in a visible pending list without counting them',()=>{
 for(const name of ['新增未分類檢查']){
  const [row]=buildHealthMgmtLoadSnapshots([record({CheckupName__c:name,ResourceCategory__c:'GynC'})]);expect(row.unmapped_count).toBe(1);expect(healthMgmtDemandSlots(row.counts)).toBe(0);
 }
 expect(classifyHealthMgmtOrder(record({CheckupName__c:'胃幽門桿菌抹片檢查',ResourceCategory__c:''})).kind).toBe('outside');
 expect(classifyHealthMgmtOrder(record({CheckupName__c:'Cisatracurium Kabi inj',ResourceCategory__c:''})).kind).toBe('outside');
});
it('does not assign missing campuses and flags missing/fallback identity rather than merging unrelated customers',()=>{
 const rows=buildHealthMgmtLoadSnapshots([record({Location__c:'',Order__r:null,Order__c:null}),record({Id:'r2',Order__r:null})]);
 expect(rows.find(r=>r.location==='未辨識').missing_identity_count).toBe(1);expect(rows.find(r=>r.location==='未辨識').counts.preparation).toBe(0);
 expect(rows.find(r=>r.location==='北投').fallback_identity_count).toBe(1);
});
it('rejects invalid or reversed sync dates and preserves zero-data dates',()=>{
 expect(()=>healthMgmtDateRange('2026-02-30','2026-03-01')).toThrow();expect(()=>healthMgmtDateRange('2026-11-14','2026-11-13')).toThrow();
 expect(healthMgmtDateRange('2026-11-13','2026-11-14')).toEqual(['2026-11-13','2026-11-14']);expect(buildHealthMgmtLoadSnapshots([])).toEqual([]);
});

it('writes explicit zero-campus snapshots for empty days so missing reads are not confused with zero demand',()=>{
 const rows=completeHealthMgmtLoadDays([],['2026-11-13','2026-11-14'],'2026-11-13T00:00:00Z');
 expect(rows).toHaveLength(4);expect(rows.every(r=>r.customer_count===0&&healthMgmtDemandSlots(r.counts)===0)).toBe(true);
});

it('keeps report-only consultations visible in the audit but excludes them from slots and pending questions',()=>{
 const names=['眼科檢查','耳鼻喉科檢查','婦科檢查','婦科檢查（自費子抹報告用）'];
 const [row]=buildHealthMgmtLoadSnapshots(names.map((CheckupName__c,i)=>record({Id:String(i),CheckupName__c,ResourceCategory__c:'會診'})));
 expect(row.unmapped_count).toBe(0);expect(healthMgmtDemandSlots(row.counts)).toBe(0);expect(row.customer_count).toBe(0);expect(row.items.every(item=>item.kind==='report')).toBe(true);
 expect(classifyHealthMgmtOrder(record({CheckupName__c:'細隙燈檢查'})).key).toBe('slitLamp');
 expect(classifyHealthMgmtOrder(record({CheckupName__c:'鼻咽內視鏡檢查'})).key).toBe('nasopharyngoscopy');
 expect(classifyHealthMgmtOrder(record({CheckupName__c:'液基薄層抹片'})).key).toBe('pap');
});

it('counts HPV and carbon13 per customer separately from pap, and deduplicates each medical-order variant',()=>{
 const names=['液基薄層抹片','人類乳突狀病毒分型','人類乳突狀病毒分型(癌篩)','碳13-尿素呼吸試驗','碳13'];
 const [row]=buildHealthMgmtLoadSnapshots(names.map((CheckupName__c,i)=>record({Id:String(i),CheckupName__c})));
 expect(row.counts.pap).toBe(1);expect(row.counts.hpv).toBe(1);expect(row.counts.carbon13).toBe(1);expect(healthMgmtDemandSlots(row.counts)).toBe(6);expect(row.unmapped_count).toBe(0);
});
