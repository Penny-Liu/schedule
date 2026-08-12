import type { User } from "../types";
import { UserRole } from "../types";
import { usernameToAuthEmail } from "./authIdentity.mjs";
import { passwordForSupabaseAuth } from "./passwordPolicy.mjs";
import { supabase } from "./supabaseClient";

export const isProtectedEditorRole = (role: UserRole | string): boolean =>
  role === UserRole.SUPERVISOR || role === UserRole.SYSTEM_ADMIN;

export const signInProtectedEditor = async (
  user: User,
  password: string,
): Promise<void> => {
  if (!isProtectedEditorRole(user.role)) return;
  if (!user.authUserId) {
    throw new Error("此管理帳號尚未完成安全登入設定，請聯絡系統管理員");
  }

  const domain = import.meta.env.VITE_AUTH_USERNAME_DOMAIN?.trim();
  if (!domain) {
    throw new Error("系統尚未設定安全登入網域");
  }
  const email = await usernameToAuthEmail(user.username, domain);
  const authPassword = await passwordForSupabaseAuth(password, user.role);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: authPassword,
  });
  if (error || !data.user || data.user.id !== user.authUserId) {
    await supabase.auth.signOut();
    throw new Error("安全登入失敗，請確認密碼或聯絡系統管理員");
  }
};

export const signOutSupabaseAuth = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) console.warn("Supabase Auth sign-out failed:", error.message);
};

export const hasProtectedEditorSession = async (user: User): Promise<boolean> => {
  if (!isProtectedEditorRole(user.role) || !user.authUserId) return false;
  const { data, error } = await supabase.auth.getUser();
  return !error && data.user?.id === user.authUserId;
};
