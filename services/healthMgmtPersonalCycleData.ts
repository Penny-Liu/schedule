import {supabase} from './supabaseClient';
import {type User,type HealthMgmtStaff,type RosterCycle} from '../types';
import {canViewHMCampus,canEditHMCampus,validateHMCycleRange,type HMCampus,type HMPersonalCycle} from './healthMgmtPersonalCycles';
const fail=(error:{code?:string;message:string})=>new Error(['42P01','PGRST205'].includes(error.code||'')?'健管個人週期尚未完成 SQL 更新':error.message);
async function verify(user:User,campus:HMCampus,edit=false){
 if(!(edit?canEditHMCampus(user,campus):canViewHMCampus(user,campus)))throw new Error('沒有此院區的週期權限');
 if(!user.authUserId)throw new Error('請完成安全登入後查看健管個人週期');
 const {data,error}=await supabase.auth.getUser();
 if(error||data.user?.id!==user.authUserId)throw new Error('登入驗證失敗，請重新登入後再試');
}
export async function fetchHMPersonalCycles(user:User,campus:HMCampus,cycleId:string,signal?:AbortSignal):Promise<HMPersonalCycle[]>{
 await verify(user,campus);const rows:HMPersonalCycle[]=[];
 for(let offset=0;;offset+=1000){
  let query=supabase.from('health_mgmt_personal_cycles').select('*').eq('campus',campus).eq('cycle_id',cycleId).order('staff_id').range(offset,offset+999);
  if(signal)query=query.abortSignal(signal);
  const {data,error}=await query;if(error)throw fail(error);
  rows.push(...data||[]);if(!data||data.length<1000)return rows;
 }
}
export async function saveHMPersonalCycle(user:User,staff:HealthMgmtStaff,cycle:RosterCycle,campus:HMCampus,value:{startDate:string;endDate:string;memo:string}|null){
 await verify(user,campus,true);
 if(cycle.location!==campus||staff.location&&staff.location!=='全部'&&staff.location!==campus)throw new Error('人員或週期不屬於目前院區');
 if(value)validateHMCycleRange(value.startDate,value.endDate,value.memo);
 const query=value?supabase.from('health_mgmt_personal_cycles').upsert({staff_id:staff.id,campus,cycle_id:cycle.id,start_date:value.startDate,end_date:value.endDate,memo:value.memo,updated_by:user.authUserId},{onConflict:'staff_id,campus,cycle_id'}):supabase.from('health_mgmt_personal_cycles').delete().eq('staff_id',staff.id).eq('campus',campus).eq('cycle_id',cycle.id);
 const {error}=await query;if(error)throw fail(error);
}
export async function saveHMDefaultCycle(user:User,cycle:RosterCycle,campus:HMCampus){
 await verify(user,campus,true);validateHMCycleRange(cycle.startDate,cycle.endDate);
 if(!cycle.name.trim()||cycle.name.length>100||cycle.location!==campus)throw new Error('請確認週期名稱與院區');
 const {error}=await supabase.rpc('set_health_mgmt_default_cycle',{p_cycle:{id:cycle.id,name:cycle.name,startDate:cycle.startDate,endDate:cycle.endDate,location:campus}});
 if(error)throw new Error(error.code==='PGRST202'?'健管週期尚未完成 SQL 更新':error.message);
}
