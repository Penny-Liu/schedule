import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const sandbox=vi.hoisted(()=>({active:false}));
vi.mock('./developerSandbox',()=>({isDeveloperSandboxActive:()=>sandbox.active,SANDBOX_BLOCKED:'sandbox blocked'}));
import {dispatchBackendSync} from './backendSync';
const tasks=[{id:1,selected:true,start:'2026-11-23',end:'2026-11-23'},{id:3,selected:true,start:'2026-11-23',end:'2026-11-23'}];
let storage:Map<string,string>;
const request=vi.fn();const prompt=vi.fn();
beforeEach(()=>{
 vi.clearAllMocks();sandbox.active=false;storage=new Map();
 vi.stubGlobal('fetch',request);vi.stubGlobal('window',{prompt});
 vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)});
 vi.stubEnv('DEV',false);
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('shared backend sync dispatch',()=>{
 it('dispatches the exact selected daily range and task ids without department mixing',async()=>{
  storage.set('GITHUB_PAT','test-token');request.mockResolvedValue({ok:true,status:204});
  const result=await dispatchBackendSync(tasks);
  expect(result.mode).toBe('cloud');
  const [url,options]=request.mock.calls[0];
  expect(url).toContain('/sync-stats.yml/dispatches');
  expect(JSON.parse(JSON.parse(options.body).inputs.sync_payload)).toEqual(tasks);
  expect(JSON.parse(options.body).ref).toBe('main');
  expect(prompt).not.toHaveBeenCalled();
 });
 it('does not send or persist a credential when the user cancels',async()=>{
  prompt.mockReturnValue(null);
  expect(await dispatchBackendSync(tasks)).toEqual({mode:'cancelled'});
  expect(request).not.toHaveBeenCalled();expect(storage.size).toBe(0);
 });
 it('removes a rejected token rather than reporting success',async()=>{
  storage.set('GITHUB_PAT','test-token');request.mockResolvedValue({ok:false,status:403});
  await expect(dispatchBackendSync(tasks)).rejects.toThrow('權限不足');expect(storage.has('GITHUB_PAT')).toBe(false);
 });
 it('does not send invalid or reversed dates',async()=>{
  await expect(dispatchBackendSync([{id:1,selected:true,start:'2026-11-24',end:'2026-11-23'}])).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();expect(prompt).not.toHaveBeenCalled();
 });
 it('blocks sandbox synchronization before sending requests',async()=>{
  sandbox.active=true;await expect(dispatchBackendSync(tasks)).rejects.toThrow('sandbox blocked');expect(request).not.toHaveBeenCalled();
 });
 it('uses the local backend only in development and propagates its errors',async()=>{
  vi.stubEnv('DEV',true);request.mockResolvedValueOnce({ok:true,status:200});
  expect(await dispatchBackendSync(tasks)).toEqual({mode:'local'});
  expect(request.mock.calls[0][0]).toBe('/api/sync-stats');expect(prompt).not.toHaveBeenCalled();
  request.mockResolvedValueOnce({ok:false,status:409,json:async()=>({error:'已有同步任務執行中'})});
  await expect(dispatchBackendSync(tasks)).rejects.toThrow('已有同步任務執行中');
 });
});
