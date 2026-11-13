import {it,expect} from 'vitest';
import {buildSyncPlan,runSyncTasks} from './run-sync-tasks.mjs';
it('runs only duration with the selected date range',()=>{
 expect(buildSyncPlan(JSON.stringify([{id:1,selected:false},{id:5,selected:true,start:'2026-10-04',end:'2026-11-02'}]))).toEqual([{script:'sync-exam-duration.mjs',args:['--from','2026-10-04','--to','2026-11-02','--write']}]);
});
it('uses 45 calendar dates for the scheduled duration default',()=>{
 expect(buildSyncPlan('[{"id":5,"selected":true}]','2026-11-05')[0].args).toEqual(['--from','2026-09-22','--to','2026-11-05','--write']);
});
it('preserves legacy tasks while running equipment and duration once each',()=>{
 const plan=buildSyncPlan(JSON.stringify([1,2,3,4,5].map(id=>({id,selected:true}))),'2026-11-05');
 expect(plan.map(s=>s.script)).toEqual(['sync-all-to-supabase.mjs','sync-equipment-visits.mjs','sync-exam-duration.mjs']);
 expect(JSON.parse(plan[0].payload).map(t=>t.id)).toEqual([1,2,3]);
 expect(buildSyncPlan('[{"id":2,"selected":true}]')).toHaveLength(1);
});
it('stops on a failed task instead of reporting successful completion',async()=>{
 const calls=[];
 await expect(runSyncTasks('[{"id":4,"selected":true},{"id":5,"selected":true}]',async step=>{calls.push(step.script);throw new Error('failed');})).rejects.toThrow('failed');
 expect(calls).toEqual(['sync-equipment-visits.mjs']);
});
it('rejects malformed dates before starting any tasks',()=>{
 expect(()=>buildSyncPlan('[{"id":5,"selected":true,"start":"2026-02-30","end":"2026-03-01"}]')).toThrow('valid date');
 expect(()=>buildSyncPlan('[{"id":5,"selected":true,"start":"2026-11-05"}]')).toThrow('both start and end');
 expect(()=>buildSyncPlan('[{"id":5,"selected":true,"start":"2026-11-05","end":"2026-11-04"}]')).toThrow('before');
});
it('supports health-management-only sync with future defaults and rejects a half date range',()=>{
 expect(buildSyncPlan('[{"id":6,"selected":true}]','2026-11-13')).toEqual([{script:'sync-health-mgmt-load.mjs',args:['--from','2026-11-13','--to','2026-11-27','--write']}]);
 expect(()=>buildSyncPlan('[{"id":6,"selected":true,"start":"2026-11-13"}]')).toThrow('both start and end');
 expect(buildSyncPlan('[{"id":6,"selected":true,"start":"2026-11-01","end":"2026-11-30"}]')[0].args).toEqual(['--from','2026-11-01','--to','2026-11-30','--write']);
});

it('uses the confirmed two-week HM window without changing radiographer duration or manually requested ranges',()=>{
 const plan=buildSyncPlan('[{"id":5,"selected":true},{"id":6,"selected":true}]','2026-12-25');
 expect(plan[0].args).toEqual(['--from','2026-11-11','--to','2026-12-25','--write']);
 expect(plan[1].args).toEqual(['--from','2026-12-25','--to','2027-01-08','--write']);
});
