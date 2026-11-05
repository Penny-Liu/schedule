import type { DailyManpowerStats, Holiday } from "../types";
import { calculateMrScheduledSlots, getMrCapacitySlotsForDate } from "./mrCapacityForecast";
import { toLocalISOString } from "./utils";

export type MrChartPreset = "20" | "past20" | "week" | "nextWeek" | "14" | "30" | "custom";
export type MrChartDay = { date: string; sunday: boolean; percent: number | null };
const localDate = (date: string) => new Date(`${date}T12:00:00`);
const shift = (date: Date, offset: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + offset);
  return result;
};

export const getMrChartRange = (anchor: string, preset: Exclude<MrChartPreset, "custom">) => {
  const base = localDate(anchor);
  if (preset === "past20") {
    return { start: toLocalISOString(shift(base, -19)), end: anchor };
  }
  if (preset === "week" || preset === "nextWeek") {
    const start = shift(base, -((base.getDay() + 6) % 7) + (preset === "nextWeek" ? 7 : 0));
    return { start: toLocalISOString(start), end: toLocalISOString(shift(start, 6)) };
  }
  return { start: toLocalISOString(shift(base, 1)), end: toLocalISOString(shift(base, Number(preset))) };
};

export const getMrChartDates = (start: string, end: string): string[] => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return [];
  if (toLocalISOString(localDate(start)) !== start || toLocalISOString(localDate(end)) !== end) return [];
  const result: string[] = [];
  for (let day = localDate(start); toLocalISOString(day) <= end; day = shift(day, 1)) {
    result.push(toLocalISOString(day));
    if (result.length > 62) return [];
  }
  return result;
};

export const buildMrChartDays = (
  dates: string[], holidays: Holiday[], readStats: (date: string) => DailyManpowerStats | undefined,
): MrChartDay[] => dates.map((date) => {
  const stats = readStats(date);
  return {
    date,
    sunday: localDate(date).getDay() === 0,
    percent: stats ? calculateMrScheduledSlots(stats) / getMrCapacitySlotsForDate(date, holidays) * 100 : null,
  };
});

export const summarizeMrChart = (days: MrChartDay[], includeSunday: boolean, warning: number) => {
  const eligible = days.filter((day) => includeSunday || !day.sunday);
  const known = eligible.filter((day): day is MrChartDay & { percent: number } => day.percent !== null);
  return {
    average: known.length ? known.reduce((sum, day) => sum + day.percent, 0) / known.length : null,
    lowDays: known.filter((day) => day.percent < warning).length,
    highest: known.reduce<(MrChartDay & { percent: number }) | null>((best, day) =>
      !best || day.percent > best.percent ? day : best, null),
    lowest: known.length ? Math.min(...known.map((day) => day.percent)) : null,
    knownDays: known.length,
    missingDays: eligible.length - known.length,
  };
};

export const mrChartDateLabel = (date: string) => {
  const value = localDate(date);
  return `${value.getMonth() + 1}/${value.getDate()} (${"日一二三四五六"[value.getDay()]})`;
};
