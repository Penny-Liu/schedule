import {it,expect,vi,afterEach} from 'vitest';
import {canEditDurationStandards,validateDurationStandards,saveSharedDurationStandards,fetchSharedDurationStandards} from './sharedExamDurationStandards';
import {supabase} from './supabaseClient';
import * as sandbox from './developerSandbox';
import {UserRole,type User} from '../types';
afterEach(()=>vi.restoreAllMocks());
const admin={role:UserRole.SYSTEM_ADMIN,authUserId:'verified-id'} as User;
it('allows only department managers and validates finite positive minutes and known timing keys',()=>{
 expect(canEditDurationStandards(admin)).toBe(true);expect(canEditDurationStandards({...admin,role:UserRole.SUPERVISOR})).toBe(true);
 expect(canEditDurationStandards({...admin,role:UserRole.RADIOGRAPHER_STAFF})).toBe(false);
 for(const value of [0,-1,NaN,Infinity,1441,1.23])expect(()=>validateDurationStandards({mrSmall:value})).toThrow();
 for(const key of ['usFibrosis','unknown'])expect(()=>validateDurationStandards({[key]:10})).toThrow();
 expect(()=>validateDurationStandards({mrSmall:40.5})).not.toThrow();
});
it('blocks unauthorized and mismatched identities before writing',async()=>{
 vi.spyOn(sandbox,'isDeveloperSandboxActive').mockReturnValue(false);
 const from=vi.spyOn(supabase,'from');
 await expect(saveSharedDurationStandards({mrSmall:45},{...admin,role:UserRole.VIEWER})).rejects.toThrow('只有');
 vi.spyOn(supabase.auth,'getUser').mockResolvedValue({data:{user:{id:'another'}},error:null} as any);
 await expect(saveSharedDurationStandards({mrSmall:45},admin)).rejects.toThrow('安全登入');expect(from).not.toHaveBeenCalled();
});
it('propagates write failures and stores all values in a single upsert for a verified manager',async()=>{
 vi.spyOn(sandbox,'isDeveloperSandboxActive').mockReturnValue(false);
 vi.spyOn(supabase.auth,'getUser').mockResolvedValue({data:{user:{id:'verified-id'}},error:null} as any);
 const upsert=vi.fn().mockResolvedValue({error:{message:'not allowed'}});vi.spyOn(supabase,'from').mockReturnValue({upsert} as any);
 await expect(saveSharedDurationStandards({mrSmall:45,ctGeneral:6},admin)).rejects.toEqual({message:'not allowed'});
 expect(upsert).toHaveBeenCalledWith([{key:'mrSmall',minutes:45},{key:'ctGeneral',minutes:6}],{onConflict:'key'});
});
it('simulates shared settings in sandbox without any production request',async()=>{
 vi.spyOn(sandbox,'isDeveloperSandboxActive').mockReturnValue(true);const from=vi.spyOn(supabase,'from');
 await saveSharedDurationStandards({mrSmall:45},admin);expect(await fetchSharedDurationStandards()).toEqual({mrSmall:45});expect(from).not.toHaveBeenCalled();
 await saveSharedDurationStandards({},admin);
});
