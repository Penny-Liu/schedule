import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }));
vi.mock('./supabaseClient', () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
import { fetchExamDuration } from './radiographerExamDuration';

beforeEach(() => { vi.clearAllMocks(); });
describe('duration data access', () => {
 it('rejects an unlinked account before querying data', async () => {
  await expect(fetchExamDuration('2026-10-01','2026-10-31')).rejects.toThrow('安全登入');
  expect(mocks.from).not.toHaveBeenCalled();
 });
 it('rejects expired or different identities instead of showing a misleading empty report', async () => {
  mocks.getUser.mockResolvedValue({data:{user:{id:'other'}},error:null});
  await expect(fetchExamDuration('2026-10-01','2026-10-31',undefined,'expected')).rejects.toThrow('不一致');
  expect(mocks.from).not.toHaveBeenCalled();
 });
 it('loads every page and the sync-day markers for the verified identity', async () => {
  mocks.getUser.mockResolvedValue({data:{user:{id:'expected'}},error:null});
  let page=0;
  mocks.from.mockImplementation((table: string) => {
   if(table.endsWith('sync_days')) {
    const q={select:vi.fn(()=>q),gte:vi.fn(()=>q),lte:vi.fn(()=>q),order:vi.fn(()=>Promise.resolve({data:[{exam_date:'2026-10-01'}],error:null}))};return q;
   }
   const q={select:vi.fn(()=>q),gte:vi.fn(()=>q),lte:vi.fn(()=>q),order:vi.fn(()=>q),range:vi.fn(()=>Promise.resolve({data:Array.from({length:page++ === 0 ? 1000:1},()=>({exam_date:'2026-10-01'})),error:null}))};return q;
  });
  const result=await fetchExamDuration('2026-10-01','2026-10-31',undefined,'expected');
  expect(result.rows).toHaveLength(1001);expect(result.days).toHaveLength(1);
 });
});
