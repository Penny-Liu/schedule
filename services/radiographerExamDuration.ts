import { supabase } from './supabaseClient';

export interface ExamDurationRow {
  metric_scope: 'item' | 'flow' | 'allocated' | 'allocation_flow' | 'planned';
  exam_date: string;
  radiographer_id: string;
  radiographer_name: string;
  category: string;
  exam_name: string;
  location: string;
  resource_name: string;
  total_count: number;
  valid_count: number;
  missing_time_count: number;
  invalid_time_count: number;
  zero_count: number;
  negative_count: number;
  shared_interval_count: number;
  duplicate_count: number;
  outlier_count: number;
  missing_staff_count: number;
  claustrophobia_count?: number | null;
  duration_histogram: Record<string, number>;
  synced_at: string;
  algorithm: string;
}
export interface DurationSyncDay {
  exam_date: string;
  source_count: number;
  synced_at: string;
  algorithm: string;
}

export async function fetchExamDuration(from: string, to: string, signal?: AbortSignal, expectedAuthUserId?: string) {
  if (!expectedAuthUserId) throw new Error("此帳號尚未完成安全登入設定，請聯絡系統管理員。耗時統計不開放匿名讀取。");
  const { data: identity, error: identityError } = await supabase.auth.getUser();
  if (identityError || !identity.user || identity.user.id !== expectedAuthUserId) {
    throw new Error("目前安全登入與此帳號不一致或已逾期，請登出後重新登入，再查看檢查耗時。");
  }
  const rows: ExamDurationRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabase.from('radiographer_exam_duration_daily').select('*')
      .gte('exam_date', from).lte('exam_date', to)
      .order('exam_date').order('metric_scope').order('radiographer_id').order('category').order('exam_name').order('location').order('resource_name')
      .range(offset, offset + 999);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  let syncQuery = supabase.from('radiographer_exam_duration_sync_days').select('exam_date,source_count,synced_at,algorithm')
    .gte('exam_date', from).lte('exam_date', to).order('exam_date');
  if (signal) syncQuery = syncQuery.abortSignal(signal);
  const { data, error } = await syncQuery;
  if (error) throw error;
  return { rows, days: (data || []) as DurationSyncDay[] };
}
