import {it,expect} from 'vitest';
import {buildAllExamDurationSummaries} from './exam-duration-summary.mjs';
import {normalizeMrDurationSessions,unionDurationIntervals} from './mr-duration-sessions.mjs';
const root=(id,start,end,extra={})=>({Id:id,Order__c:'visit',CheckStartDate__c:'2026-10-04',ResourceCategory__c:'MR',CheckupName__c:'流程報到',ProcessType__c:'流程報到',Gender__c:'女',Location__c:'北投',Resource__c:'room',Resource__r:{Name:'MR1'},Radiologist__c:'a',Radiologist__r:{Name:'甲'},End__c:true,examination_StartTime1__c:`2026-10-04T${start}:00Z`,examination_EndTime1__c:`2026-10-04T${end}:00Z`,StartTime__c:'09:00:00.000Z',EndTime__c:'10:30:00.000Z',...extra});
const children=(parent,n,breast=false)=>Array.from({length:n},(_,i)=>({...parent,Id:`${parent.Id}:c${i}`,CheckupReservationId__c:parent.Id,ProcessType__c:'檢查',Checkup__c:`${parent.Id}:i${i}`,CheckupName__c:breast?'乳房磁振造影(顯影)':`部位${i}`}));
it('combines body and breast segments into a single large-female flow and a separate 90 minute plan',()=>{
 const a=root('body','01:00','01:50'),b=root('breast','02:00','02:30');
 const rows=buildAllExamDurationSummaries([a,b,...children(a,8),...children(b,1,true)]);
 const flows=rows.filter(r=>r.metric_scope==='flow');
 expect(flows).toHaveLength(1);expect(flows[0].exam_name).toBe('MR 整次｜大型套（7 項以上）・女');expect(flows[0].duration_histogram).toEqual({'4800':1});
 expect(rows.find(r=>r.metric_scope==='planned').duration_histogram).toEqual({'5400':1});
 const allocated=rows.filter(r=>r.metric_scope==='allocated');
 expect(allocated.reduce((n,r)=>n+r.valid_count,0)).toBe(9);
 expect(allocated.reduce((n,r)=>n+Object.entries(r.duration_histogram).reduce((s,[seconds,count])=>s+Number(seconds)*count,0),0)).toBeCloseTo(4800);
});
it('does not double-count overlapping segments or count gaps',()=>{
 expect(unionDurationIntervals([['2026-10-04T01:00Z','2026-10-04T02:00Z'],['2026-10-04T01:30Z','2026-10-04T02:30Z']]).seconds).toBe(5400);
 expect(unionDurationIntervals([['2026-10-04T01:00Z','2026-10-04T01:30Z'],['2026-10-04T03:00Z','2026-10-04T03:30Z']]).seconds).toBe(3600);
});
it('keeps female packages without breast out of the standard large-female group',()=>{
 const a=root('body','01:00','01:50');
 const flow=buildAllExamDurationSummaries([a,...children(a,8)]).find(r=>r.metric_scope==='flow');
 expect(flow.exam_name).toBe('MR 整次｜大型套（未含乳房）・女');
});
it('does not assign a shared complete package to either operator',()=>{
 const a=root('body','01:00','01:50'),b=root('breast','02:00','02:30',{Radiologist__c:'b',Radiologist__r:{Name:'乙'}});
 const rows=buildAllExamDurationSummaries([a,b,...children(a,8),...children(b,1,true)]);
 for(const scope of ['flow','planned','allocated','allocation_flow'])expect(rows.filter(r=>r.metric_scope===scope).reduce((n,r)=>n+r.valid_count,0)).toBe(0);
});
it('never combines different orders, days or locations and does not merge duplicate source ids twice',()=>{
 const a=root('one','01:00','01:50');
 for(const change of [{Order__c:'other'},{CheckStartDate__c:'2026-10-05'},{Location__c:'大直'}]) {
  const b=root('two','02:00','02:30',change);
  expect(normalizeMrDurationSessions([a,b,...children(a,8),...children(b,1,true)]).filter(r=>r.ProcessType__c==='流程報到')).toHaveLength(2);
 }
 expect(normalizeMrDurationSessions([a,a,...children(a,8)]).filter(r=>r.ProcessType__c==='流程報到')).toHaveLength(1);
});
it('does not turn an incomplete, negative or oversized segment into a valid complete flow',()=>{
 const a=root('body','01:00','01:50');
 for(const change of [{examination_StartTime1__c:null},{examination_EndTime1__c:'2026-10-04T01:00:00Z'},{examination_EndTime1__c:'2026-10-04T08:00:00Z'}]){
  const b=root('breast','02:00','02:30',change);
  const flows=buildAllExamDurationSummaries([a,b,...children(a,8),...children(b,1,true)]).filter(r=>r.metric_scope==='flow');
  expect(flows.reduce((n,r)=>n+r.valid_count,0)).toBe(0);
 }
});
