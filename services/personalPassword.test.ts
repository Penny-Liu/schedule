import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from './supabaseClient';
import { saveSandboxPersonalPassword } from './personalPassword';
import { db } from './store';
import * as sandbox from './developerSandbox';
import { User, UserRole } from '../types';

const user = { id: 'self', authUserId: 'auth-self', role: UserRole.SYSTEM_ADMIN, password: '1234ab', mustChangePassword: true } as User;
const originalUsers = db.users;
const originalCurrent = db.currentUser;
let network: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'session-token' } }, error: null } as any);
  vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: { id: 'auth-self' } }, error: null } as any);
  network = vi.fn(async () => new Response(JSON.stringify([{ id: 'self' }]), { status: 200 }));
  vi.stubGlobal('fetch', network);
});
afterEach(() => {
  db.users = originalUsers; db.currentUser = originalCurrent;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('sandbox personal password exception', () => {
  it('writes only the verified self password and completion flag, retaining sandbox mode', async () => {
    vi.spyOn(sandbox, 'isDeveloperSandboxActive').mockReturnValue(true);
    db.users = [{ ...user }]; db.currentUser = db.users[0];
    const from = vi.spyOn(supabase, 'from');
    await db.changePassword('self', 'NewTest2026');
    expect(network).toHaveBeenCalledTimes(3);
    const [verify, auth, profile] = network.mock.calls as any;
    expect(verify[0].searchParams.get('auth_user_id')).toBe('eq.auth-self');
    expect(auth[0].pathname).toBe('/auth/v1/user');
    expect(auth[1].method).toBe('PUT');
    expect(JSON.parse(auth[1].body)).toEqual({ password: 'NewTest2026' });
    expect(profile[0].pathname).toBe('/rest/v1/users');
    expect(profile[0].searchParams.get('id')).toBe('eq.self');
    expect(profile[0].searchParams.get('auth_user_id')).toBe('eq.auth-self');
    expect(JSON.parse(profile[1].body)).toEqual({ password: 'NewTest2026', must_change_password: false });
    expect(from).not.toHaveBeenCalled();
    expect(db.currentUser.mustChangePassword).toBe(false);
    expect(sandbox.isDeveloperSandboxActive()).toBe(true);
  });
  it('rejects another local account before any network write', async () => {
    vi.spyOn(sandbox, 'isDeveloperSandboxActive').mockReturnValue(true);
    db.users = [{ ...user }]; db.currentUser = { ...user, id: 'someone-else' };
    await expect(db.updateUserPassword('self', 'NewTest2026')).rejects.toThrow('目前登入');
    expect(network).not.toHaveBeenCalled();
  });
  it('rejects an unlinked or mismatched authenticated identity', async () => {
    await expect(saveSandboxPersonalPassword({ ...user, authUserId: undefined }, 'NewTest2026')).rejects.toThrow('安全登入設定');
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: { id: 'other' } }, error: null } as any);
    await expect(saveSandboxPersonalPassword(user, 'NewTest2026')).rejects.toThrow('目前登入');
    expect(network).not.toHaveBeenCalled();
  });
  it('rejects a simulated profile that has no matching production account', async () => {
    network.mockResolvedValueOnce(new Response('[]'));
    await expect(saveSandboxPersonalPassword(user, 'NewTest2026')).rejects.toThrow('正式帳號');
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('propagates Auth rejection without changing profile or local state', async () => {
    vi.spyOn(sandbox, 'isDeveloperSandboxActive').mockReturnValue(true);
    db.users = [{ ...user }]; db.currentUser = db.users[0];
    network.mockResolvedValueOnce(new Response('[{"id":"self"}]'))
      .mockResolvedValueOnce(new Response('{"msg":"Password rejected"}', { status: 422 }));
    await expect(db.updateUserPassword('self', 'NewTest2026')).rejects.toThrow('Password rejected');
    expect(network).toHaveBeenCalledTimes(2);
    expect(db.users[0].password).toBe('1234ab');
  });
  it('reports partial completion rather than success when the profile update affects zero rows', async () => {
    network.mockResolvedValueOnce(new Response('[{"id":"self"}]'))
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response('[]'));
    await expect(saveSandboxPersonalPassword(user, 'NewTest2026')).rejects.toThrow('請勿登出');
  });
});
