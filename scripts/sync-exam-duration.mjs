import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { getSalesforceSession, runSoqlQuery } from './salesforce-utils.mjs';
import { buildAllExamDurationSummaries, DURATION_ALGORITHM } from './exam-duration-summary.mjs';

const taipeiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function dateRange(from, to) {
  const valid = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
  if (!valid(from) || !valid(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 366) throw new Error('請提供有效起訖日（最多 367 天）。');
  const days = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

export async function assertDurationWriteCompatibility(db) {
 const {data,error}=await db.rpc('supports_exam_duration_algorithm',{p_algorithm:DURATION_ALGORITHM});
 if(error||data!==true)throw new Error('US 比例算法尚未完成資料庫部署，請先套用對應 migration，再重新同步；未寫入任何統計資料。');
}

export async function syncExamDuration({ from, to, write = false }) {
  const days = dateRange(from, to);
  let db;
  if(write) {
    const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key)throw new Error('寫入耗時統計需要伺服器端 SUPABASE_SERVICE_ROLE_KEY。');
    db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    await assertDurationWriteCompatibility(db);
  }
  const capturedAt = new Date().toISOString();
  const session = await getSalesforceSession();
  const { records } = await runSoqlQuery({ ...session, soql: `
    SELECT Id, Order__c, Checkup__c, CheckupReservationId__c, ProcessType__c, Gender__c, CheckStartDate__c, Radiologist__c, Radiologist__r.Name,
      ResourceCategory__c, CheckupName__c, Resource__c, Resource__r.Name, Location__c,
      examination_StartTime1__c, examination_EndTime1__c, StartTime__c, EndTime__c, End__c,
      CTAUseTime__c, CTA_Further_Rad__c, CTA_Further_Rad__r.Name, CTA_Further_StartTime__c, CTA_Further_EndTime__c
    FROM CheckupReservation__c
    WHERE CheckStartDate__c >= ${from} AND CheckStartDate__c <= ${to}
      AND ResourceCategory__c IN ('MR','CT','US','BMD','MG','DX')
      AND Checkup_Status__c = '10' AND End__c = true
  ` });
  const summaries = buildAllExamDurationSummaries(records, capturedAt);
  const diagnostics = {};
  for (const row of summaries) {
    const group = diagnostics[`${row.metric_scope}:${row.category}`] ||= {};
    for (const [key, value] of Object.entries(row)) if (key.endsWith('_count')) group[key] = (group[key] || 0) + value;
  }
  console.log(JSON.stringify({ from, to, mode: write ? 'write' : 'audit', diagnostics }, null, 2));
  if (!write) return { summaries, diagnostics };
  for (const day of days) {
    const { error } = await db.rpc('replace_radiographer_exam_duration_day', {
      p_date: day, p_rows: summaries.filter(row => row.exam_date === day), p_captured_at: capturedAt,
    });
    if (error) throw new Error(`耗時同步未完成 (${day})：${error.message}`);
  }
  console.log(`耗時同步完成：${days.length} 天、${summaries.length} 筆每日彙總。`);
  return { summaries, diagnostics };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const arg = name => args[args.indexOf(name) + 1];
  const to = args.includes('--to') ? arg('--to') : taipeiToday();
  const from = args.includes('--from') ? arg('--from') : new Date(Date.parse(to) - 44 * 86400000).toISOString().slice(0, 10);
  syncExamDuration({ from, to, write: args.includes('--write') }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
