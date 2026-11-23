import {supabase} from './supabaseClient';
import {normalizeHealthMgmtReportOrders,type HMLoadSnapshot,type HMLoadSyncDay} from './healthMgmtLoad';
export async function fetchHealthMgmtLoad(from:string,to:string,expectedAuthUserId:string|undefined,signal?:AbortSignal){
 if(!expectedAuthUserId)throw new Error('請完成安全登入後查看健管負載。');
 const {data:auth,error:authError}=await supabase.auth.getUser();
 if(authError){
  if(authError.name==='AuthSessionMissingError')throw new Error('目前沒有有效登入憑證，請重新登入後查看健管負載。');
  throw new Error(`登入驗證失敗：${authError.message}。請重新登入；無需重新同步檢查量。`);
 }
 if(!auth.user)throw new Error('目前沒有有效登入憑證，請重新登入後查看健管負載。');
 if(auth.user.id!==expectedAuthUserId)throw new Error('登入身分與目前帳號不符，請重新登入後查看健管負載。');
 const rows:HMLoadSnapshot[]=[],days:HMLoadSyncDay[]=[];
 for(const [table,target]of [['health_mgmt_load_daily',rows],['health_mgmt_load_sync_days',days]] as const){
  for(let offset=0;;offset+=1000){
   let query=supabase.from(table).select('*').gte('exam_date',from).lte('exam_date',to).order('exam_date').range(offset,offset+999);if(table==='health_mgmt_load_daily')query=query.order('location');if(signal)query=query.abortSignal(signal);
   const {data,error}=await query;if(error)throw new Error(error.code==='42P01'||error.code==='PGRST205'?'健管負載尚未完成 SQL 更新及資料同步。':error.message);
   (target as unknown[]).push(...data||[]);if(!data||data.length<1000)break;
  }
 }
 return {rows:rows.map(normalizeHealthMgmtReportOrders),days};
}
