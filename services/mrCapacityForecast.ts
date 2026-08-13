import type { DailyManpowerStats } from "../types";

export const MR_FULL_CAPACITY_SLOTS = 96;
export const MR_LARGE_PACKAGE_SLOTS = 9;
export const MR_SINGLE_REGION_SLOTS = 3;

export type MrCapacityLevel = "green" | "yellow" | "red";

export interface MrCapacityForecast {
  scheduledSlots: number;
  remainingSlots: number;
  utilizationPercent: number;
  level: MrCapacityLevel;
  emoji: "🟢" | "🟡" | "🔴";
  availableLargePackages: number;
  availableSingleRegions: number;
}

const normalizeCount = (value: number | undefined): number =>
  Math.max(0, Number(value) || 0);

export const calculateMrScheduledSlots = (
  stats: DailyManpowerStats,
): number =>
  Math.round(
    normalizeCount(stats.beitou_mr_large_male) * 7 +
      normalizeCount(stats.beitou_mr_large_female) * 9 +
      normalizeCount(stats.beitou_mr_medium) * 3 +
      normalizeCount(stats.beitou_mr_small) * 3,
  );

export const formatMrPackageComposition = (
  stats: DailyManpowerStats,
): string =>
  [
    `${normalizeCount(stats.beitou_mr_large_male)} 男大`,
    `${normalizeCount(stats.beitou_mr_large_female)} 女大`,
    `${normalizeCount(stats.beitou_mr_medium)} 中`,
    `${normalizeCount(stats.beitou_mr_small)} 小`,
  ].join("、");

export const calculateMrCapacityForecast = (
  scheduledSlots: number,
): MrCapacityForecast => {
  const normalizedSlots = Math.max(0, Math.round(Number(scheduledSlots) || 0));
  const remainingSlots = Math.max(0, MR_FULL_CAPACITY_SLOTS - normalizedSlots);
  const utilizationPercent = Math.round(
    (normalizedSlots / MR_FULL_CAPACITY_SLOTS) * 100,
  );
  const rawUtilization = normalizedSlots / MR_FULL_CAPACITY_SLOTS;
  const level: MrCapacityLevel =
    rawUtilization < 0.75
      ? "green"
      : rawUtilization <= 0.9
        ? "yellow"
        : "red";

  return {
    scheduledSlots: normalizedSlots,
    remainingSlots,
    utilizationPercent,
    level,
    emoji: level === "green" ? "🟢" : level === "yellow" ? "🟡" : "🔴",
    availableLargePackages: Math.floor(
      remainingSlots / MR_LARGE_PACKAGE_SLOTS,
    ),
    availableSingleRegions: Math.floor(
      remainingSlots / MR_SINGLE_REGION_SLOTS,
    ),
  };
};

export const formatMrCapacityStatus = (
  forecast: MrCapacityForecast,
  packageComposition?: string,
): string => {
  const summary = `${forecast.emoji} ${forecast.utilizationPercent}% (已排 ${forecast.scheduledSlots} Slot)`;
  const lines = [summary];

  if (packageComposition) {
    lines.push(`- ${packageComposition}`);
  }

  if (forecast.level === "red") {
    lines.push(
      `- 滿載控管，僅餘特案 ${forecast.availableSingleRegions} 單部位`,
    );
  } else {
    lines.push(
      `- 可安插 ${forecast.availableLargePackages} 大套或 ${forecast.availableSingleRegions} 單部位`,
    );
  }

  return lines.join("\n");
};
