import type { User } from '../types';
import { isLoginEligible } from './loginEligibility';

type LoginSource = {
  initializeAuthData(force: boolean): Promise<void>;
  getUsers(): User[];
  authLoadError: string | null;
};

export async function refreshLoginAccount(source: LoginSource, id: string, today: string): Promise<User> {
  await source.initializeAuthData(true);
  if (source.authLoadError) throw new Error('無法更新登入資料，請稍後再試');
  const user = source.getUsers().find((user) => user.id === id);
  if (!user || !isLoginEligible(user, today)) throw new Error('此帳號目前無法登入，請聯絡系統管理員');
  return user;
}
