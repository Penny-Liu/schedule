import type { User } from '../types';
import { supabase } from './supabaseClient';
import { assertPasswordMigrationReadyForRole, passwordForSupabaseAuth } from './passwordPolicy.mjs';

/** The only sandbox write exception: a verified account's own password fields. */
export async function saveSandboxPersonalPassword(user: User, password: string) {
  assertPasswordMigrationReadyForRole(password, user.role);
  if (!user.authUserId) throw new Error('此沙盒帳號尚未完成安全登入設定，無法修改正式密碼');
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error('安全登入已失效，請重新登入後再修改密碼');
  const { data: verified, error: verifyError } = await supabase.auth.getUser(token);
  if (verifyError || verified.user?.id !== user.authUserId) {
    throw new Error('只能修改目前登入帳號的個人密碼，請重新登入');
  }
  const origin = import.meta.env.VITE_SUPABASE_URL;
  const headers = {
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  // Never expose a generic bypass, temporarily disable the sandbox, or reuse
  // simulated user rows to authorize a production write.
  const profileUrl = new URL('/rest/v1/users', origin);
  profileUrl.searchParams.set('id', `eq.${user.id}`);
  profileUrl.searchParams.set('auth_user_id', `eq.${verified.user.id}`);
  profileUrl.searchParams.set('select', 'id,role');
  const profile = await fetch(profileUrl, { headers });
  if (!profile.ok) throw new Error('無法確認正式帳號資料，密碼尚未修改');
  const rows = await profile.json();
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== user.id) {
    throw new Error('正式帳號與登入身分不符，密碼尚未修改');
  }
  assertPasswordMigrationReadyForRole(password, rows[0].role);
  const authPassword = await passwordForSupabaseAuth(password, rows[0].role);
  const authResponse = await fetch(new URL('/auth/v1/user', origin), {
    method: 'PUT', headers, body: JSON.stringify({ password: authPassword }),
  });
  if (!authResponse.ok) {
    const failure = await authResponse.json().catch(() => ({}));
    throw new Error(failure.msg || failure.message || '正式登入密碼修改失敗，請稍後再試');
  }
  const response = await fetch(profileUrl, {
    method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ password, must_change_password: false }),
  });
  const saved = response.ok ? await response.json() : null;
  if (!Array.isArray(saved) || saved.length !== 1 || saved[0].id !== user.id) {
    throw new Error('安全登入密碼已更新，但人員密碼資料尚未同步。請勿登出，請再次送出相同新密碼完成同步');
  }
}
