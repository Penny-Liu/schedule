import type { DailyManpowerStats } from "../types";

const normalizeCount = (value: number | undefined): number =>
  Math.max(0, Math.round(Number(value) || 0));

export const formatRadiographerDailyLineSummary = (
  date: string,
  stats: DailyManpowerStats,
): string => {
  const [year, month, day] = date.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day);
  const weekdayNumber = targetDate.getDay() === 0 ? 7 : targetDate.getDay();
  const largePackages =
    normalizeCount(stats.beitou_mr_large_male) +
    normalizeCount(stats.beitou_mr_large_female);

  return [
    `${month}/${day} w${weekdayNumber}`,
    "",
    `解說：${normalizeCount(stats.beitou_clients)}人`,
    `MR：${normalizeCount(stats.beitou_mr)}人（${largePackages}大・${normalizeCount(stats.beitou_mr_medium)}中・${normalizeCount(stats.beitou_mr_small)}小）`,
    `CT：${normalizeCount(stats.beitou_ct)}人`,
    `CTA：${normalizeCount(stats.beitou_cta)}人`,
    `US：${normalizeCount(stats.beitou_ultrasound_clients)}人`,
    `GI：${normalizeCount(stats.beitou_gi)}台`,
  ].join("\n");
};
