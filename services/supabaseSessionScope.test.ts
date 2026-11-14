import {describe,it,expect,vi,beforeEach} from 'vitest';
import {UserRole,type User} from '../types';
const mock=vi.hoisted(()=>({signOut:vi.fn(),signInWithPassword:vi.fn(),getUser:vi.fn()}));
vi.mock('./supabaseClient',()=>({supabase:{auth:mock}}));
vi.mock('./authIdentity.mjs',()=>({usernameToAuthEmail:vi.fn(async()=> 'test@example.org')}));
import {signOutSupabaseAuth,signInProtectedEditor} from './supabaseAuth';
beforeEach(()=>{vi.clearAllMocks();mock.signOut.mockResolvedValue({error:null});});
describe('local auth session scope',()=>{
 it('does not revoke other devices on logout',async()=>{
  await signOutSupabaseAuth();expect(mock.signOut).toHaveBeenCalledWith({scope:'local'});
 });
 it('rejects login before entering the app if the new session is unavailable',async()=>{
  vi.stubEnv('VITE_AUTH_USERNAME_DOMAIN','example.org');
  mock.signInWithPassword.mockResolvedValue({data:{user:{id:'auth'}},error:null});
  mock.getUser.mockResolvedValue({data:{user:null},error:{message:'no session'}});
  await expect(signInProtectedEditor({role:UserRole.HM_SUPERVISOR,authUserId:'auth',username:'user'} as User,'password')).rejects.toThrow('登入憑證未能完成驗證');
  expect(mock.signOut).toHaveBeenCalledWith({scope:'local'});
  vi.unstubAllEnvs();
 });
});
