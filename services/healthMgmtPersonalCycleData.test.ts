import {beforeEach,describe,expect,it,vi} from 'vitest';
import {UserRole,PERMISSIONS as P,type User,type HealthMgmtStaff,type RosterCycle} from '../types';
const api=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn(),from:vi.fn(),upsert:vi.fn()}));
vi.mock('./supabaseClient',()=>({supabase:{auth:{getUser:api.getUser},rpc:api.rpc,from:api.from}}));
import {saveHMDefaultCycle,saveHMPersonalCycle,fetchHMPersonalCycles} from './healthMgmtPersonalCycleData';
const user={id:'u',authUserId:'auth',role:UserRole.HM_SUPERVISOR,healthMgmtLocation:'北投',permissions:[P.VIEW_HEALTH_MGMT,P.EDIT_HEALTH_MGMT]} as User;
const cycle={id:'n',name:'第11週期',location:'北投',startDate:'2026-11-03',endDate:'2026-12-01',staffOrder:['stale-order'],isConfirmed:false} as RosterCycle;
const staff={id:'s',location:'北投'} as HealthMgmtStaff;
beforeEach(()=>{vi.clearAllMocks();api.getUser.mockResolvedValue({data:{user:{id:'auth'}},error:null});api.rpc.mockResolvedValue({error:null});api.upsert.mockResolvedValue({error:null});api.from.mockReturnValue({upsert:api.upsert});});
describe('health management cycle data access',()=>{
 it('sends only edited default fields so current ordering and lock metadata are preserved on the server',async()=>{
  await saveHMDefaultCycle(user,cycle,'北投');
  expect(api.rpc).toHaveBeenCalledWith('set_health_mgmt_default_cycle',{p_cycle:{id:'n',name:'第11週期',location:'北投',startDate:'2026-11-03',endDate:'2026-12-01'}});
 });
 it('saves a single scoped personal row instead of replacing another campus map',async()=>{
  await saveHMPersonalCycle(user,staff,cycle,'北投',{startDate:'2026-11-01',endDate:'2026-11-30',memo:'test'});
  expect(api.from).toHaveBeenCalledWith('health_mgmt_personal_cycles');
  expect(api.upsert).toHaveBeenCalledWith({staff_id:'s',campus:'北投',cycle_id:'n',start_date:'2026-11-01',end_date:'2026-11-30',memo:'test',updated_by:'auth'},{onConflict:'staff_id,campus,cycle_id'});
 });
 it('does not query another campus or save another campus staff',async()=>{
  await expect(fetchHMPersonalCycles(user,'大直','s')).rejects.toThrow('院區的週期權限');
  await expect(saveHMPersonalCycle(user,{...staff,location:'大直'},cycle,'北投',null)).rejects.toThrow('人員或週期');
  expect(api.from).not.toHaveBeenCalled();expect(api.rpc).not.toHaveBeenCalled();
 });
 it('does not query personal data under a mismatched login',async()=>{
  api.getUser.mockResolvedValue({data:{user:{id:'other'}},error:null});
  await expect(fetchHMPersonalCycles(user,'北投','n')).rejects.toThrow('登入驗證失敗');expect(api.from).not.toHaveBeenCalled();
 });
});
