import { DateEventType } from "../types";
import type { DailyManpowerStats, Holiday } from "../types";

export const MR_FULL_CAPACITY_SLOTS = 96;
export const MR_REDUCED_CAPACITY_SLOTS = Math.round(
  MR_FULL_CAPACITY_SLOTS * 0.8,
);
export const MR_LARGE_PACKAGE_SLOTS = 9;
export const MR_SINGLE_REGION_SLOTS = 3;
export const MR_SCHEDULING_TARGET_RATE = 0.9;

export type MrCapacityLevel = "green" | "yellow" | "red";

export interface MrCapacityForecast {
  capacitySlots: number;
  scheduledSlots: number;
  remainingSlots: number;
  schedulingLimitSlots: number;
  schedulableSlots: number;
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

export const getMrCapacitySlotsForDate = (
  date: string,
  holidays: Holiday[],
): number => {
  const isSunday = new Date(`${date}T00:00:00`).getDay() === 0;
  const isNationalHoliday = holidays.some(
    (holiday) =>
      holiday.date === date && holiday.type === DateEventType.NATIONAL,
  );

  return isSunday || isNationalHoliday
    ? MR_REDUCED_CAPACITY_SLOTS
    : MR_FULL_CAPACITY_SLOTS;
};

export const formatMrPackageComposition = (
  stats: DailyManpowerStats,
): string => {
  const packageCounts = [
    [normalizeCount(stats.beitou_mr_large_male), "男大"],
    [normalizeCount(stats.beitou_mr_large_female), "女大"],
    [normalizeCount(stats.beitou_mr_medium), "中"],
    [normalizeCount(stats.beitou_mr_small), "小"],
  ] as const;

  return packageCounts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`)
    .join("、");
};

export const calculateMrCapacityForecast = (
  scheduledSlots: number,
  capacitySlots: number = MR_FULL_CAPACITY_SLOTS,
): MrCapacityForecast => {
  const normalizedSlots = Math.max(0, Math.round(Number(scheduledSlots) || 0));
  const normalizedCapacity = Math.max(
    1,
    Math.round(Number(capacitySlots) || MR_FULL_CAPACITY_SLOTS),
  );
  const remainingSlots = Math.max(0, normalizedCapacity - normalizedSlots);
  const schedulingLimitSlots = normalizedCapacity * MR_SCHEDULING_TARGET_RATE;
  const schedulableSlots = Math.max(
    0,
    schedulingLimitSlots - normalizedSlots,
  );
  const utilizationPercent = Math.round(
    (normalizedSlots / normalizedCapacity) * 100,
  );
  const rawUtilization = normalizedSlots / normalizedCapacity;
  const level: MrCapacityLevel =
    rawUtilization < 0.75
      ? "green"
      : rawUtilization <= 0.9
        ? "yellow"
        : "red";

  return {
    capacitySlots: normalizedCapacity,
    scheduledSlots: normalizedSlots,
    remainingSlots,
    schedulingLimitSlots,
    schedulableSlots,
    utilizationPercent,
    level,
    emoji: level === "green" ? "🟢" : level === "yellow" ? "🟡" : "🔴",
    availableLargePackages: Math.floor(
      schedulableSlots / MR_LARGE_PACKAGE_SLOTS,
    ),
    availableSingleRegions: Math.floor(
      schedulableSlots / MR_SINGLE_REGION_SLOTS,
    ),
  };
};

export const formatMrCapacityStatus = (
  forecast: MrCapacityForecast,
  packageComposition?: string,
): string => {
  const summary = `運用率${forecast.utilizationPercent}% (${forecast.scheduledSlots} Slot)`;
  const lines = [summary];

  if (packageComposition) {
    lines.push(
      "排程：",
      `- ${packageComposition
        .split("、")
        .map((item) => item.replaceAll(" ", ""))
        .join("  ")}`,
    );
  }

  const availability = `${forecast.availableLargePackages}大套或${forecast.availableSingleRegions}單部位`;
  if (
    forecast.availableLargePackages > 0 ||
    forecast.availableSingleRegions > 0
  ) {
    lines.push(`- 再安插${availability}`);
  }

  return lines.join("\n");
};
