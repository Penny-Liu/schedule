import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from './store';
import { supabase } from './supabaseClient';
import * as sandbox from './developerSandbox';
import { User, UserRole } from '../types';

const originalUsers = db.users;
afterEach(() => { db.users = originalUsers; vi.restoreAllMocks(); });
const account = () => ({ id: 'reset-test', name: '測試', role: UserRole.SYSTEM_ADMIN,
  authUserId: 'auth-test', password: 'OldTest2026' } as User);

describe('staff password reset boundaries', () => {
  it('permits simulated reset for a linked account in sandbox', async () => {
    vi.spyOn(sandbox, 'isDeveloperSandboxActive').mockReturnValue(true);
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    vi.spyOn(supabase, 'from').mockReturnValue({ update } as any);
    db.users = [account()];
    expect(await db.resetPassword('reset-test')).toBe('1234ab');
    expect(db.users[0].mustChangePassword).toBe(true);
    expect(update).toHaveBeenCalledWith({ password: '1234ab', must_change_password: true });
  });
  it('continues to block unsupported real Auth resets before issuing a write', async () => {
    vi.spyOn(sandbox, 'isDeveloperSandboxActive').mockReturnValue(false);
    const from = vi.spyOn(supabase, 'from');
    db.users = [account()];
    await expect(db.resetPassword('reset-test')).rejects.toThrow('已啟用安全登入');
    expect(from).not.toHaveBeenCalled();
    expect(db.users[0].password).toBe('OldTest2026');
  });
  it('propagates a specific write failure without changing the local password', async () => {
    vi.spyOn(sandbox, 'isDeveloperSandboxActive').mockReturnValue(true);
    const failure = { message: '權限不足', code: '42501' };
    vi.spyOn(supabase, 'from').mockReturnValue({ update: () => ({ eq: async () => ({ error: failure }) }) } as any);
    db.users = [account()];
    await expect(db.resetPassword('reset-test')).rejects.toEqual(failure);
    expect(db.users[0].password).toBe('OldTest2026');
  });
});
