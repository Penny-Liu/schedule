import { describe, expect, it, vi } from 'vitest';
import { UserRole, type User } from '../types';
import { refreshLoginAccount } from './loginAccount';
const before = { id: 'hm', role: UserRole.HM_STAFF, isActive: true } as User;
describe('refresh account before login', () => {
  it('uses a newly bound identity instead of the selected stale account', async () => {
    let users = [before];
    const after = {...before, authUserId: 'new-auth-id'};
    const source = {authLoadError: null, getUsers: () => users,
      initializeAuthData: vi.fn(async () => { users = [after]; })};
    const result = await refreshLoginAccount(source, before.id, '2026-11-14');
    expect(source.initializeAuthData).toHaveBeenCalledWith(true);
    expect(result).toBe(after);
    expect(before.authUserId).toBeUndefined();
  });
  it('does not fall back to stale accounts after a refresh failure', async () => {
    const source = {authLoadError: 'network failure', getUsers: () => [before], initializeAuthData: vi.fn(async () => {})};
    await expect(refreshLoginAccount(source, before.id, '2026-11-14')).rejects.toThrow('無法更新登入資料');
  });
  it('rejects removed or newly disabled accounts', async () => {
    for (const users of [[], [{...before,isActive:false}]]) {
      const source = {authLoadError:null,getUsers:()=>users,initializeAuthData:vi.fn(async()=>{})};
      await expect(refreshLoginAccount(source,before.id,'2026-11-14')).rejects.toThrow('目前無法登入');
    }
  });
});
