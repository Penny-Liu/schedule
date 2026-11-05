import type { ExamDurationRow } from './radiographerExamDuration';

export const durationCountKeys = [
  'total_count', 'valid_count', 'missing_time_count', 'invalid_time_count', 'zero_count',
  'negative_count', 'shared_interval_count', 'duplicate_count', 'outlier_count', 'missing_staff_count',
] as const;

// 合併頻數後再計算平均與中位數，不能把每日平均／中位數再平均。
export function summarizeExamDurations(rows: ExamDurationRow[]) {
  const counts = Object.fromEntries(durationCountKeys.map(key => [key, 0])) as Record<typeof durationCountKeys[number], number>;
  const histogram: Record<string, number> = {};
  for (const row of rows) {
    for (const key of durationCountKeys) counts[key] += Number(row[key] || 0);
    for (const [seconds, frequency] of Object.entries(row.duration_histogram)) histogram[seconds] = (histogram[seconds] || 0) + frequency;
  }
  const values = Object.entries(histogram).map(([seconds, n]) => ({ seconds: Number(seconds), n })).sort((a, b) => a.seconds - b.seconds);
  const n = values.reduce((sum, value) => sum + value.n, 0);
  const at = (index: number) => {
    let cumulative = 0;
    for (const value of values) { cumulative += value.n; if (cumulative > index) return value.seconds; }
    return 0;
  };
  const averageMinutes = n ? values.reduce((sum, value) => sum + value.seconds * value.n, 0) / n / 60 : null;
  const medianMinutes = n ? (at(Math.floor((n - 1) / 2)) + at(Math.floor(n / 2))) / 2 / 60 : null;
  const validRate = counts.total_count ? counts.valid_count / counts.total_count : 0;
  return { ...counts, averageMinutes, medianMinutes, validRate, reliable: counts.valid_count >= 10 && validRate >= 0.8 };
}

export function groupExamDurations(rows: ExamDurationRow[]) {
  const groups = new Map<string, ExamDurationRow[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.metric_scope, row.radiographer_id, row.radiographer_name, row.category, row.exam_name, row.location, row.resource_name]);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.values()].map(group => ({ ...group[0], ...summarizeExamDurations(group) }))
    .sort((a, b) => a.radiographer_name.localeCompare(b.radiographer_name, 'zh-Hant') || a.category.localeCompare(b.category) || a.exam_name.localeCompare(b.exam_name, 'zh-Hant'));
}
