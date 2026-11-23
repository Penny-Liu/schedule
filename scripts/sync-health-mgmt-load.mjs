import 'dotenv/config';
import {defaultHealthMgmtSyncRange} from '../services/healthMgmtSyncRange.mjs';
import {createClient} from '@supabase/supabase-js';
import {pathToFileURL} from 'node:url';
import {getSalesforceSession,runSoqlQuery} from './salesforce-utils.mjs';
import {HM_LOAD_RULES} from '../services/healthMgmtLoadRules.mjs';
import {buildHealthMgmtLoadSnapshots,completeHealthMgmtLoadDays} from './health-mgmt-load-summary.mjs';
export function healthMgmtDateRange(from,to){
 const valid=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!valid(from)||!valid(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>366)throw new Error('健管同步日期無效（最多 367 天）。');
 return Array.from({length:(Date.parse(to)-Date.parse(from))/86400000+1},(_,i)=>new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10));
}
export async function syncHealthMgmtLoad({from,to,write=false}){
 const days=healthMgmtDateRange(from,to),capturedAt=new Date().toISOString();let db;
 if(write){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY,url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
  if(!key||!url)throw new Error('健管同步寫入需要伺服器端 service role。');
  db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error}=await db.from('health_mgmt_load_sync_days').select('exam_date').limit(1);if(error)throw new Error('請先完成健管負載 SQL 更新，未寫入任何資料。');
 }
 const session=await getSalesforceSession();
 const names=[...new Set(HM_LOAD_RULES.flatMap(rule=>rule.names))].map(name=>"'"+name.replace(/'/g,"\\'")+"'").join(',');
 const {records}=await runSoqlQuery({...session,soql:`SELECT Id,Order__c,Order__r.Contact__c,CheckupName__c,CheckStartDate__c,Location__c,ResourceCategory__c,ProcessType__c,Checkup_Status__c FROM CheckupReservation__c WHERE CheckStartDate__c >= ${from} AND CheckStartDate__c <= ${to} AND Checkup_Status__c = '10' AND (ResourceCategory__c IN ('檢備','OphE','OphC','EntC','GynC','聽-肺','HRV-ABI','會診') OR CheckupName__c IN (${names}))`});
 const snapshots=completeHealthMgmtLoadDays(buildHealthMgmtLoadSnapshots(records,capturedAt),days,capturedAt);
 if(write)for(const day of days){const {error}=await db.rpc('replace_health_mgmt_load_day',{p_date:day,p_rows:snapshots.filter(r=>r.exam_date===day),p_captured_at:capturedAt});if(error)throw new Error(`健管同步失敗 ${day}：${error.message}`);}
 console.log(JSON.stringify({mode:write?'write':'audit',from,to,days:days.length,snapshots:snapshots.length,sourceRecords:records.length,unmapped:snapshots.reduce((n,r)=>n+r.unmapped_count,0),missingIdentity:snapshots.reduce((n,r)=>n+r.missing_identity_count,0)},null,2));
 return snapshots;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 syncHealthMgmtLoad({from:args.includes('--from')?arg('--from'):today,to:args.includes('--to')?arg('--to'):defaultHealthMgmtSyncRange(today).to,write:args.includes('--write')}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
