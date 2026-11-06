import {supabase} from './supabaseClient';
import {isDeveloperSandboxActive} from './developerSandbox';
import {UserRole,type User} from '../types';
import {examDurationStandards,isDurationStandardValue,type DurationStandardOverrides} from './examDurationStandards';
export const canEditDurationStandards=(user:User)=>[UserRole.SYSTEM_ADMIN,UserRole.SUPERVISOR].includes(user.role);
export function validateDurationStandards(values:DurationStandardOverrides) {
 for(const [key,value] of Object.entries(values))if(!examDurationStandards.some(s=>s.key===key&&s.key!=='usFibrosis')||!isDurationStandardValue(value))throw new Error('標準時間須為 0.1～1440 分鐘，最多一位小數。');
}
let simulated:DurationStandardOverrides={};
export async function fetchSharedDurationStandards() {
 if(isDeveloperSandboxActive())return {...simulated};
 const {data,error}=await supabase.from('exam_duration_standards').select('key,minutes');
 if(error)throw error;
 const values=Object.fromEntries((data||[]).map(r=>[r.key,Number(r.minutes)]));validateDurationStandards(values);return values;
}
export async function saveSharedDurationStandards(values:DurationStandardOverrides,user:User) {
 if(!canEditDurationStandards(user))throw new Error('只有放射師主管與系統管理員可修改標準時間。');
 validateDurationStandards(values);
 if(isDeveloperSandboxActive()){simulated={...values};return;}
 const {data,error}=await supabase.auth.getUser();
 if(error||!data.user||data.user.id!==user.authUserId)throw new Error('安全登入已變更，請重新登入後儲存。');
 const result=await supabase.from('exam_duration_standards').upsert(Object.entries(values).map(([key,minutes])=>({key,minutes})),{onConflict:'key'});
 if(result.error)throw result.error;
}
export function subscribeDurationStandards(reload:()=>void) {
 if(isDeveloperSandboxActive())return ()=>{};
 let timer:ReturnType<typeof setTimeout>|undefined;
 const changed=()=>{if(timer)clearTimeout(timer);timer=setTimeout(reload,150);};
 const channel=supabase.channel('exam-duration-standard-settings').on('postgres_changes',{event:'*',schema:'public',table:'exam_duration_standards'},changed).subscribe();
 return ()=>{if(timer)clearTimeout(timer);void supabase.removeChannel(channel);};
}
