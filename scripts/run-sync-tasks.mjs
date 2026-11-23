import 'dotenv/config';
import {defaultHealthMgmtSyncRange} from '../services/healthMgmtSyncRange.mjs';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { validateSyncPayload } from '../pages/syncValidation.js';

export function buildSyncPlan(payload, today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())) {
  const tasks = JSON.parse(validateSyncPayload(payload)).filter(task=>task.selected);
  const plan = [];
  const legacy = tasks.filter(task=>task.id<=3);
  if(legacy.length) plan.push({script:'sync-all-to-supabase.mjs',args:[],payload:JSON.stringify(legacy)});
  if(tasks.some(task=>task.id===4)) plan.push({script:'sync-equipment-visits.mjs',args:[]});
  const duration=tasks.find(task=>task.id===5);
  if(duration) {
    const from=duration.start || new Date(Date.parse(today)-44*86400000).toISOString().slice(0,10);
    const to=duration.end || today;
    plan.push({script:'sync-exam-duration.mjs',args:['--from',from,'--to',to,'--write']});
  }
  const health=tasks.find(task=>task.id===6);
  if(health){const from=health.start||today,to=health.end||defaultHealthMgmtSyncRange(today).to;plan.push({script:'sync-health-mgmt-load.mjs',args:['--from',from,'--to',to,'--write']});}
  return plan;
}

const execute = step => new Promise((resolve,reject)=>{
  const env={...process.env};
  delete env.SYNC_PAYLOAD;
  delete env.SYNC_BLOCKS;
  if(step.payload)env.SYNC_PAYLOAD=step.payload;
  const child=spawn(process.execPath,[fileURLToPath(new URL(step.script,import.meta.url)),...step.args],{env,stdio:'inherit'});
  let settled=false;
  const finish=error=>{if(settled)return;settled=true;clearTimeout(timeout);if(error)reject(error);else resolve();};
  const stop=()=>{child.kill('SIGTERM');finish(new Error('同步任務已停止'));};
  process.once('SIGTERM',stop);
  const timeout=setTimeout(()=>{child.kill('SIGTERM');finish(new Error('同步任務逾時'));},9*60*1000);
  child.once('error',finish);
  child.once('close',code=>{process.removeListener('SIGTERM',stop);finish(code===0?undefined:new Error(`${step.script} 同步失敗（${code}）`));});
});

export async function runSyncTasks(payload, executeStep=execute) {
  const plan=buildSyncPlan(payload);
  for(const step of plan)await executeStep(step);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  runSyncTasks(process.env.SYNC_PAYLOAD).then(()=>console.log('所有選取的同步任務已完成。')).catch(error=>{console.error(error.message);process.exitCode=1;});
}
