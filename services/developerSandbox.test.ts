import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { DeveloperSandbox, DEVELOPER_SANDBOX, isDeveloperSandboxUser } from './developerSandbox';

const origin = 'https://sandbox-test.supabase.co';

function setup() {
  const remote = [
    { id: '1', name: '原有人員', date: '2026-10-15', location: '北投', value: 1 },
    { id: '2', name: '第二人員', date: '2026-10-16', location: '大直', value: 2 },
  ];
  const network = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init);
    // Every network call must be a read, including those needed for simulations.
    expect(request.method).toBe('GET');
    const url = new URL(request.url);
    let rows = remote.filter(row => [...url.searchParams].every(([key, val]) =>
      !val.startsWith('eq.') || String(row[key as keyof typeof row]) === val.slice(3)));
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 1000);
    rows = rows.slice(offset, offset + limit);
    return new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json' } });
  });
  const sandbox = new DeveloperSandbox(network, origin);
  sandbox.enable();
  const client = createClient(origin, 'test-key', {
    global: { fetch: sandbox.fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { sandbox, network, client, remote };
}

describe('developer sandbox through the actual Supabase client', () => {
  it('keeps a saved personal password while preserving other simulated edits', async () => {
    const { client, sandbox, remote } = setup();
    await client.from('users').update({ name: '模擬改名', password: 'temporary', must_change_password: true }).eq('id', '1');
    sandbox.syncPersonalPassword('1', 'NewPersonal2026');
    const result = await client.from('users').select().eq('id', '1').single();
    expect(result.data).toMatchObject({ name: '模擬改名', password: 'NewPersonal2026', must_change_password: false });
    await client.from('users').update({ name: '繼續模擬' }).eq('id', '1');
    expect((await client.from('users').select().eq('id', '1').single()).data.name).toBe('繼續模擬');
    expect(remote[0].name).toBe('原有人員');
  });

  it('preserves ordinary network requests until sandbox login', async () => {
    const network = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const sandbox = new DeveloperSandbox(network, origin);
    await sandbox.fetch(`${origin}/rest/v1/users`, { method: 'POST', body: '{"name":"ordinary request"}' });
    expect(network).toHaveBeenCalledWith(`${origin}/rest/v1/users`, expect.objectContaining({ method: 'POST' }));
    expect(sandbox.enabled).toBe(false);
  });

  it('updates locally, rereads the simulated value, and leaves source data unchanged', async () => {
    const { client, remote } = setup();
    const saved = await client.from('users').update({ name: '模擬改名', value: 0.7 }).eq('id', '1').select().single();
    expect(saved.error).toBeNull();
    expect(saved.data).toMatchObject({ id: '1', name: '模擬改名', value: 0.7 });
    const reread = await client.from('users').select('id,name,value').eq('id', '1').single();
    expect(reread.data).toEqual({ id: '1', name: '模擬改名', value: 0.7 });
    expect(remote[0].name).toBe('原有人員');
  });

  it('inserts and deletes only locally, including generated IDs and repeated reads', async () => {
    const { client, remote } = setup();
    const saved = await client.from('users').insert({ name: '模擬新增', location: '北投' }).select().single();
    expect(saved.error).toBeNull();
    expect(saved.data.id).toBeTruthy();
    expect((await client.from('users').select().eq('id', saved.data.id)).data).toHaveLength(1);
    expect((await client.from('users').delete().eq('id', '1')).error).toBeNull();
    expect((await client.from('users').select().eq('id', '1')).data).toEqual([]);
    expect((await client.from('users').delete().eq('id', saved.data.id)).error).toBeNull();
    expect((await client.from('users').select()).data).toHaveLength(1);
    expect(remote).toHaveLength(2);
  });

  it('handles a move between filters, sorting, projections, and exact counts', async () => {
    const { client } = setup();
    await client.from('shifts').update({ location: '大直' }).eq('id', '1');
    expect((await client.from('shifts').select().eq('location', '北投')).data).toEqual([]);
    const result = await client.from('shifts').select('id,location', { count: 'exact' }).eq('location', '大直').order('date', { ascending: false }).range(0, 0);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: '2', location: '大直' }]);
    expect(result.count).toBe(2);
    const count = await client.from('shifts').select('*', { count: 'exact', head: true });
    expect(count.error).toBeNull();
    expect(count.count).toBe(2);
  });

  it('upserts composite conflicts and supports zero and null values', async () => {
    const { client } = setup();
    const result = await client.from('shifts').upsert({ date: '2026-10-15', location: '北投', value: 0, name: null }, { onConflict: 'date, location' }).select().single();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ id: '1', value: 0, name: null });
    expect((await client.from('shifts').select().is('name', null)).data).toHaveLength(1);
  });

  it('keeps writes isolated across tables and clears changes in a new session', async () => {
    const { client, network } = setup();
    await client.from('users').update({ name: '模擬修改' }).eq('id', '1');
    expect((await client.from('shifts').select().eq('id', '1')).data?.[0].name).toBe('原有人員');
    const fresh = new DeveloperSandbox(network, origin);
    fresh.enable();
    expect(await (await fresh.fetch(`${origin}/rest/v1/users?id=eq.1`)).json()).toEqual([
      expect.objectContaining({ name: '原有人員' }),
    ]);
  });

  it('supports user-keyed private profiles without adding an id column', async () => {
    const { client } = setup();
    const saved = await client.from('radiographer_private_profiles').upsert({ user_id: 'staff-id', birth_date: '2000-01-01' }, { onConflict: 'user_id' }).select().single();
    expect(saved.error).toBeNull();
    expect(saved.data).toEqual({ user_id: 'staff-id', birth_date: '2000-01-01' });
    expect((await client.from('radiographer_private_profiles').select('birth_date').eq('user_id', 'staff-id').maybeSingle()).data).toEqual({ birth_date: '2000-01-01' });
  });

  it('blocks RPC, functions, uploads, auth changes, and external sync without sending them', async () => {
    const { sandbox, network } = setup();
    for (const url of [
      `${origin}/rest/v1/rpc/reset_data`, `${origin}/functions/v1/sync`,
      `${origin}/storage/v1/object/uploads/test`, `${origin}/auth/v1/user`,
      'https://api.github.com/repos/test/test/actions/workflows/sync/dispatches',
      'https://site.example/api/sync-stats',
    ]) {
      await expect(sandbox.fetch(url, { method: 'POST', body: '{}' })).rejects.toThrow('開發沙盒');
    }
    await expect(sandbox.fetch(`${origin}/rest/v1/rpc/reset_data`)).rejects.toThrow('開發沙盒');
    expect(network).not.toHaveBeenCalled();
  });

  it('fails closed on unsupported filters without making a write request', async () => {
    const { client } = setup();
    const result = await client.from('users').update({ name: '不應成功' }).textSearch('name', 'test');
    expect(result.error?.message).toContain('開發沙盒');
    expect((await client.from('users').select().eq('id', '1')).data?.[0].name).toBe('原有人員');
  });

  it('only enables for the explicit account setting', () => {
    expect(isDeveloperSandboxUser({ permissions: ['staff_edit'] })).toBe(false);
    expect(isDeveloperSandboxUser({ permissions: [DEVELOPER_SANDBOX] })).toBe(true);
  });
});
