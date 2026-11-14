import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({getUser:vi.fn(),from:vi.fn()}));
vi.mock('./supabaseClient',()=>({supabase:{auth:{getUser:mock.getUser},from:mock.from}}));
import {fetchHealthMgmtLoad} from './healthMgmtLoadData';
beforeEach(()=>vi.clearAllMocks());
describe('health management load identity errors',()=>{
 it('rejects missing credentials without querying snapshots',async()=>{
  mock.getUser.mockResolvedValue({data:{user:null},error:{name:'AuthSessionMissingError',message:'missing'}});
  await expect(fetchHealthMgmtLoad('2026-11-14','2026-11-14','expected')).rejects.toThrow('沒有有效登入憑證');
  expect(mock.from).not.toHaveBeenCalled();
 });
 it('distinguishes an incorrect session identity',async()=>{
  mock.getUser.mockResolvedValue({data:{user:{id:'other'}},error:null});
  await expect(fetchHealthMgmtLoad('2026-11-14','2026-11-14','expected')).rejects.toThrow('登入身分與目前帳號不符');
  expect(mock.from).not.toHaveBeenCalled();
 });
 it('reports verification errors rather than instructing users to sync data',async()=>{
  mock.getUser.mockResolvedValue({data:{user:null},error:{name:'AuthRetryableFetchError',message:'network failure'}});
  await expect(fetchHealthMgmtLoad('2026-11-14','2026-11-14','expected')).rejects.toThrow('登入驗證失敗：network failure');
  expect(mock.from).not.toHaveBeenCalled();
 });
});
