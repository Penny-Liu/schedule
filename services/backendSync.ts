import {validateSyncPayload} from '../pages/syncValidation';
import {isDeveloperSandboxActive,SANDBOX_BLOCKED} from './developerSandbox';
export type BackendSyncResult={mode:'local'|'cloud'|'cancelled';workflowUrl?:string};
export async function dispatchBackendSync(tasks:unknown[]):Promise<BackendSyncResult>{
 if(isDeveloperSandboxActive())throw new Error(SANDBOX_BLOCKED);
 const payload=validateSyncPayload(JSON.stringify(tasks));
 if(import.meta.env.DEV){
  const response=await fetch('/api/sync-stats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({syncPayload:payload})});
  if(!response.ok){const result=await response.json().catch(()=>null);throw new Error(result?.error||'同步請求失敗，請確認後端服務狀態。');}
  return {mode:'local'};
 }
 let token=localStorage.getItem('GITHUB_PAT')?.trim();
 if(!token){
  token=window.prompt('請輸入您的 GitHub Personal Access Token (PAT) 來觸發雲端同步：\n(只需輸入一次，會儲存在您的瀏覽器中)')?.trim();
  if(!token)return {mode:'cancelled'};
  localStorage.setItem('GITHUB_PAT',token);
 }
 const response=await fetch('https://api.github.com/repos/Penny-Liu/schedule/actions/workflows/sync-stats.yml/dispatches',{
  method:'POST',headers:{Accept:'application/vnd.github.v3+json',Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({ref:'main',inputs:{sync_payload:payload}}),
 });
 if([401,403,404].includes(response.status)){localStorage.removeItem('GITHUB_PAT');throw new Error('GitHub Token 無效、權限不足或找不到儲存庫，請重新設定後再試。');}
 if(!response.ok)throw new Error(`GitHub API 請求失敗（狀態碼：${response.status}）`);
 return {mode:'cloud',workflowUrl:'https://github.com/Penny-Liu/schedule/actions/workflows/sync-stats.yml'};
}
