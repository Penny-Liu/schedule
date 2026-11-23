import { it as test } from 'vitest';
import assert from 'node:assert/strict';
import { buildExamDurationSummaries, buildAllocatedExamDurationSummaries, MAX_DURATION_SECONDS } from './exam-duration-summary.mjs';
const record = (changes = {}) => ({
 Id: 'r1', Order__c: 'visit1', Checkup__c: 'item1', CheckStartDate__c: '2026-10-01',
 Radiologist__c: 'staff1', Radiologist__r: { Name: '放射師甲' }, Resource__c: 'room1',
 Resource__r: { Name: 'US1' }, Location__c: '北投', ResourceCategory__c: 'US', CheckupName__c: '腹部',
 examination_StartTime1__c: '2026-10-01T01:00:00Z', examination_EndTime1__c: '2026-10-01T01:10:00Z', ...changes,
});
test('excludes each invalid reason separately and conserves all source counts', () => {
 const inputs = [record(), record({ Id:'r2', examination_StartTime1__c:null }), record({ Id:'r3', examination_EndTime1__c:'bad' }), record({ Id:'r4', examination_EndTime1__c:'2026-10-01T01:00:00Z' }), record({ Id:'r5', examination_EndTime1__c:'2026-10-01T00:59:00Z' }), record({ Id:'r6', examination_EndTime1__c:'2026-10-01T06:00:00Z' })];
 const [g] = buildExamDurationSummaries(inputs);
 assert.equal(g.total_count,6); assert.equal(g.valid_count,1);
 for(const key of ['missing_time_count','invalid_time_count','zero_count','negative_count','outlier_count']) assert.equal(g[key],1);
 assert.deepEqual(g.duration_histogram,{'600':1});
});
test('different items sharing a single interval are not attributed to each item', () => {
 const rows=buildExamDurationSummaries([record(),record({Id:'r2',Checkup__c:'item2',CheckupName__c:'乳房'})]);
 assert.equal(rows.reduce((s,r)=>s+r.shared_interval_count,0),2);
 assert.equal(rows.reduce((s,r)=>s+r.valid_count,0),0);
});
test('different staff sharing an interval are not counted as two independent examinations', () => {
 const rows=buildExamDurationSummaries([record(),record({Id:'r2',Radiologist__c:'staff2',Radiologist__r:{Name:'放射師乙'}})]);
 assert.equal(rows.reduce((s,r)=>s+r.shared_interval_count,0),2);
});
test('deduplicates identical item intervals but not different visits or rooms', () => {
 const rows=buildExamDurationSummaries([record(),record({Id:'r2'}),record({Id:'r3',Order__c:'visit2'}),record({Id:'r4',Resource__c:'room2',Resource__r:{Name:'US2'}})]);
 assert.equal(rows.reduce((s,r)=>s+r.valid_count,0),3);
 assert.equal(rows.reduce((s,r)=>s+r.duplicate_count,0),1);
});
test('source ids are deduplicated and no patient or order identifiers leave the reducer', () => {
 const source=record({PatientName__c:'not to retain'});
 const result=buildExamDurationSummaries([source,source]);
 assert.equal(result[0].total_count,1);
 const output=JSON.stringify(result); for(const secret of ['visit1','PatientName','not to retain','2026-10-01T01:00:00Z']) assert.ok(!output.includes(secret));
});
test('includes missing radiographers as a quality reason and ignores registration', () => {
 const rows=buildExamDurationSummaries([record({Radiologist__c:null,Radiologist__r:null}),record({Id:'r2',CheckupName__c:'檢查報到'})]);
 assert.equal(rows.length,1);assert.equal(rows[0].missing_staff_count,1);assert.equal(rows[0].valid_count,0);
});
test('allows exactly four hours and flags longer intervals', () => {
 const rows=buildExamDurationSummaries([record({examination_EndTime1__c:'2026-10-01T05:00:00Z'})]);
 assert.equal(rows[0].duration_histogram[MAX_DURATION_SECONDS],1);
});

test('uses a timed parent once instead of treating batch-finished MR children as individual durations', async () => {
 const {buildAllExamDurationSummaries}=await import('./exam-duration-summary.mjs');
 const parent=record({Id:'parent',CheckupName__c:'流程報到',ProcessType__c:'流程報到',ResourceCategory__c:'MR',End__c:true,Gender__c:'女',examination_EndTime1__c:'2026-10-01T02:00:00Z'});
 const children=Array.from({length:8},(_,i)=>record({Id:`child${i}`,CheckupReservationId__c:'parent',Checkup__c:`item${i}`,CheckupName__c:`部位${i}`,ResourceCategory__c:'MR',End__c:true,examination_StartTime1__c:'2026-10-01T02:00:00Z',examination_EndTime1__c:'2026-10-01T02:00:00Z'}));
 const rows=buildAllExamDurationSummaries([parent,...children]);
 const flow=rows.filter(r=>r.metric_scope==='flow');
 assert.equal(flow.length,1);assert.equal(flow[0].total_count,1);assert.equal(flow[0].valid_count,1);
 assert.deepEqual(flow[0].duration_histogram,{'3600':1});assert.ok(flow[0].exam_name.includes('大型套'));
 assert.equal(rows.filter(r=>r.metric_scope==='item').reduce((s,r)=>s+r.zero_count,0),8);
});

test('does not assign a shared parent flow to one person when child operators differ', async () => {
 const {buildExamFlowSummaries}=await import('./exam-duration-summary.mjs');
 const parent=record({Id:'parent',CheckupName__c:'流程報到',ProcessType__c:'流程報到',End__c:true});
 const rows=buildExamFlowSummaries([parent,record({Id:'child1',CheckupReservationId__c:'parent'}),record({Id:'child2',CheckupReservationId__c:'parent',Radiologist__c:'staff2',Radiologist__r:{Name:'乙'}})]);
 assert.equal(rows[0].valid_count,0);assert.equal(rows[0].missing_staff_count,1);assert.equal(rows[0].radiographer_name,'多人共同（未拆分）');
});

test('uses children to identify the operator when the completed parent has no operator', async () => {
 const {buildExamFlowSummaries}=await import('./exam-duration-summary.mjs');
 const parent=record({Id:'parent',CheckupName__c:'流程報到',ProcessType__c:'流程報到',End__c:true,Radiologist__c:null,Radiologist__r:null});
 const rows=buildExamFlowSummaries([parent,record({Id:'child1',CheckupReservationId__c:'parent'})]);
 assert.equal(rows[0].radiographer_id,'staff1');assert.equal(rows[0].valid_count,1);
});

test('uses independent postprocessing clocks and deduplicates by order and operator', async()=>{
 const {buildSupplementalDurationSummaries}=await import('./exam-duration-summary.mjs');
 const r=record({CTA_Further_Rad__c:'post-person',CTA_Further_Rad__r:{Name:'後處理人員'},ResourceCategory__c:'CT',CTA_Further_StartTime__c:'2026-10-01T03:00:00Z',CTA_Further_EndTime__c:'2026-10-01T03:02:00Z'});
 const result=buildSupplementalDurationSummaries([r,{...r,Id:'copy'}]);
 assert.equal(result.length,1);assert.equal(result[0].exam_name,'CT後處理');assert.equal(result[0].total_count,1);assert.deepEqual(result[0].duration_histogram,{'120':1});assert.equal(result[0].radiographer_id,'post-person');
});

test('does not invent MR postprocessing durations from a scan interval',async()=>{
 const {buildSupplementalDurationSummaries}=await import('./exam-duration-summary.mjs');
 const result=buildSupplementalDurationSummaries([record({ResourceCategory__c:'MR',CTA_Further_Rad__c:'post',CTA_Further_Rad__r:{Name:'後處理'}})]);
 assert.equal(result[0].exam_name,'MR後處理');assert.equal(result[0].valid_count,0);assert.equal(result[0].missing_time_count,1);
});

test('CTA uses the parent instrument flow and stays separate from postprocessing',async()=>{
 const {buildSupplementalDurationSummaries}=await import('./exam-duration-summary.mjs');
 const parent=record({Id:'parent',ResourceCategory__c:'CT'});
 const child=record({Id:'child',CheckupReservationId__c:'parent',ResourceCategory__c:'CT',CTAUseTime__c:0,examination_StartTime1__c:'2026-10-01T01:10:00Z'});
 const [result]=buildSupplementalDurationSummaries([parent,child]);
 assert.equal(result.exam_name,'CTA');assert.equal(result.metric_scope,'flow');assert.equal(result.valid_count,1);assert.deepEqual(result.duration_histogram,{'600':1});
});

test('allocates a completed flow over actual unique orders and preserves total duration', () => {
 const root=record({Id:'root',CheckupName__c:'流程報到',examination_EndTime1__c:'2026-10-01T02:00:00Z'});
 const children=Array.from({length:6},(_,i)=>record({Id:`c${i}`,CheckupReservationId__c:'root',Checkup__c:`i${i}`}));
 const rows=buildAllocatedExamDurationSummaries([root,...children,children[0],record({Id:'cancel',CheckupReservationId__c:'root',End__c:false}),record({Id:'post',CheckupReservationId__c:'root',CheckupName__c:'US後處理'})]);
 assert.equal(rows.reduce((s,r)=>s+r.valid_count,0),6);
 assert.equal(rows.reduce((s,r)=>s+Object.entries(r.duration_histogram).reduce((n,[seconds,count])=>n+Number(seconds)*count,0),0),3600);
 assert.ok(rows.every(r=>r.metric_scope==='allocated' && r.duration_histogram['600']));
});
test('rejects an outlier flow before division and ambiguous staff allocation', () => {
 const root=record({Id:'root',CheckupName__c:'流程報到',examination_EndTime1__c:'2026-10-01T06:00:00Z'});
 const child=record({Id:'child',CheckupReservationId__c:'root'});
 assert.equal(buildAllocatedExamDurationSummaries([root,child])[0].outlier_count,1);
 assert.equal(buildAllocatedExamDurationSummaries([{...root,examination_EndTime1__c:'2026-10-01T02:00:00Z'},{...child,Radiologist__c:'other'}])[0].shared_interval_count,1);
});
test('counts one independent source per flow and subtype even when multiple orders share the subtype',()=>{
 const root=record({Id:'root',CheckupName__c:'流程報到'});
 const children=['腹部超音波','上腹超音波','乳房超音波'].map((name,i)=>record({Id:`child${i}`,CheckupName__c:name,CheckupReservationId__c:'root'}));
 const rows=buildAllocatedExamDurationSummaries([root,...children],undefined,true);
 assert.equal(rows.length,3);
 for(const subtype of ['全部','usA','usBreast']) {
  const r=rows.find(r=>r.exam_name.endsWith(`｜${subtype}`));
  assert.equal(r.metric_scope,'allocation_flow');assert.equal(r.valid_count,1);
 }
});
test('allocates US time by the provided 1:1:2:1:2 weights and excludes fibrosis orders',()=>{
 const root=record({Id:'root',CheckupName__c:'流程報到',examination_EndTime1__c:'2026-10-01T02:10:00Z'});
 const names=['甲狀腺超音波','頸動脈超音波','腹部超音波','骨盆(女)','乳房超音波','肝纖維超音波'];
 const children=names.map((name,i)=>record({Id:`w${i}`,Checkup__c:`item${i}`,CheckupName__c:name,CheckupReservationId__c:'root'}));
 const rows=buildAllocatedExamDurationSummaries([root,...children]);
 assert.equal(rows.reduce((n,r)=>n+r.valid_count,0),5);
 for(const [i,seconds]of [600,600,1200,600,1200].entries())assert.deepEqual(rows.find(r=>r.exam_name.endsWith(names[i])).duration_histogram,{[seconds]:1});
 assert.equal(rows.some(r=>r.exam_name.includes('肝纖維')),false);
 const sources=buildAllocatedExamDurationSummaries([root,...children],undefined,true);
 assert.equal(sources.some(r=>r.exam_name.endsWith('usFibrosis')),false);
 assert.equal(sources.find(r=>r.exam_name.endsWith('全部')).valid_count,1);
});
test('applies weights per actual medical order, including repeated body parts and both pelvis genders',()=>{
 const root=record({Id:'root',CheckupName__c:'流程報到',examination_EndTime1__c:'2026-10-01T02:00:00Z'});
 const names=['腹部超音波','全腹超音波','骨盆(男)','骨盆(女)'];
 const rows=buildAllocatedExamDurationSummaries([root,...names.map((name,i)=>record({Id:`repeat${i}`,CheckupName__c:name,Checkup__c:`distinct${i}`,CheckupReservationId__c:'root'}))]);
 assert.deepEqual(rows.find(r=>r.exam_name.endsWith('骨盆(男)')).duration_histogram,{'600':1});
 assert.deepEqual(rows.find(r=>r.exam_name.endsWith('腹部超音波')).duration_histogram,{'1200':1});
});
test('does not invent a ratio for unclassified mixed ultrasound, and preserves independent timing',()=>{
 const root=record({Id:'root',CheckupName__c:'流程報到'});
 const heart=record({Id:'heart',CheckupName__c:'心臟超音波',CheckupReservationId__c:'root'});
 const abdomen=record({Id:'abdomen',CheckupName__c:'腹部超音波',CheckupReservationId__c:'root'});
 assert.equal(buildAllocatedExamDurationSummaries([root,heart])[0].valid_count,1);
 assert.equal(buildAllocatedExamDurationSummaries([root,{...heart,CheckupName__c:'未分類超音波'},abdomen]).reduce((n,r)=>n+r.valid_count,0),0);
 assert.equal(buildAllocatedExamDurationSummaries([root,record({...heart,CheckupName__c:'肝纖維超音波'})]).length,0);
});

test('blocks a weighted write until the matching database migration is available',async()=>{
 const {assertDurationWriteCompatibility}=await import('./sync-exam-duration.mjs');
 await assert.rejects(()=>assertDurationWriteCompatibility({rpc:async()=>({data:null,error:{message:'missing function'}})}),/未寫入任何統計資料/);
 await assert.rejects(()=>assertDurationWriteCompatibility({rpc:async()=>({data:false,error:null})}),/尚未完成資料庫部署/);
 await assertDurationWriteCompatibility({rpc:async(name,args)=>{assert.ok(['supports_exam_duration_algorithm','supports_exam_duration_care_notes'].includes(name));if(args)assert.equal(args.p_algorithm,'actual-flow-v4');return {data:true,error:null};}});
});

test('includes neck weight 1 and heart weight 3 in mixed US while conserving the full interval',()=>{
 const root=record({Id:'root',CheckupName__c:'流程報到',examination_EndTime1__c:'2026-10-01T02:50:00Z'});
 const names=['甲狀腺超音波','頸動脈超音波','腹部超音波','骨盆(女)','乳房超音波','頸部超音波','心臟超音波','肝纖維超音波'];
 const rows=buildAllocatedExamDurationSummaries([root,...names.map((name,i)=>record({Id:`complete${i}`,Checkup__c:`item${i}`,CheckupName__c:name,CheckupReservationId__c:'root'}))]);
 assert.equal(rows.reduce((n,r)=>n+r.valid_count,0),7);
 for(const [i,seconds]of [600,600,1200,600,1200,600,1800].entries())assert.deepEqual(rows.find(r=>r.exam_name.endsWith(names[i])).duration_histogram,{[seconds]:1});
 assert.equal(rows.reduce((n,r)=>n+Object.entries(r.duration_histogram).reduce((sum,[seconds,count])=>sum+Number(seconds)*count,0),0),6600);
 assert.equal(rows.some(r=>r.exam_name.includes('肝纖維')),false);
});

test('counts explicit current-order claustrophobia care only for deduplicated valid MR samples',()=>{
 const base=record({ResourceCategory__c:'MR',Order__r:{Care__c:'其他;幽閉'},CheckupName__c:'MR頭部'});
 const rows=buildExamDurationSummaries([base,{...base,Id:'duplicate'},record({Id:'bad',ResourceCategory__c:'MR',Order__r:{Care__c:'幽閉'},examination_StartTime1__c:null}),record({Id:'negative',Order__c:'v2',ResourceCategory__c:'MR',CheckupName__c:'MR頭部',Order__r:{Care__c:'無幽閉'}})]);
 assert.equal(rows.reduce((n,r)=>n+r.claustrophobia_count,0),1);
 assert.ok(!JSON.stringify(rows).includes('Order__r'));assert.ok(!JSON.stringify(rows).includes('其他;幽閉'));
});
test('counts a segmented MR session once instead of once per segment or allocated order',async()=>{
 const {buildAllExamDurationSummaries}=await import('./exam-duration-summary.mjs');
 const roots=[record({Id:'root1',ResourceCategory__c:'MR',ProcessType__c:'報到',CheckupName__c:'MR報到',Gender__c:'男'}),record({Id:'root2',ResourceCategory__c:'MR',ProcessType__c:'報到',CheckupName__c:'MR報到',Gender__c:'男',Order__r:{Care__c:'幽閉'}})];
 const items=Array.from({length:7},(_,i)=>record({Id:'i'+i,Checkup__c:'c'+i,ResourceCategory__c:'MR',CheckupName__c:'部位'+i,CheckupReservationId__c:i<3?'root1':'root2'}));
 const rows=buildAllExamDurationSummaries([...roots,...items]);
 assert.equal(rows.filter(r=>r.metric_scope==='flow').reduce((n,r)=>n+r.claustrophobia_count,0),1);
 assert.equal(rows.filter(r=>r.metric_scope==='allocation_flow').reduce((n,r)=>n+r.claustrophobia_count,0),1);
});
test('stops before writes when care-note schema capability is missing',async()=>{
 const {assertDurationWriteCompatibility}=await import('./sync-exam-duration.mjs');
 await assert.rejects(()=>assertDurationWriteCompatibility({rpc:async name=>name==='supports_exam_duration_algorithm'?{data:true,error:null}:{data:null,error:{message:'missing'}}}),/關懷註記尚未完成資料庫部署/);
});
