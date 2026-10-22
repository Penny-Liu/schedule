import { describe, expect, it } from "vitest";
import { DateEventType, type DailyManpowerStats, type Holiday } from "../types";
import { buildMrChartDays, getMrChartDates, getMrChartRange, summarizeMrChart } from "./mrUtilizationChart";

const stats = (small: number) => ({ beitou_mr_small: small }) as DailyManpowerStats;

describe("MR chart date ranges", () => {
  it("uses Monday–Sunday weeks, including a Sunday anchor", () => {
    expect(getMrChartRange("2026-11-08", "week")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(getMrChartRange("2026-11-08", "nextWeek")).toEqual({ start: "2026-11-09", end: "2026-11-15" });
  });
  it("starts future windows tomorrow and handles year boundaries", () => {
    expect(getMrChartRange("2026-12-25", "14")).toEqual({ start: "2026-12-26", end: "2027-01-08" });
    const range = getMrChartRange("2026-10-22", "20");
    expect(getMrChartDates(range.start, range.end)).toHaveLength(20);
    expect(getMrChartRange("2026-01-05", "past20")).toEqual({ start: "2025-12-17", end: "2026-01-05" });
    expect(getMrChartDates("2026-10-23", "2026-11-21")).toHaveLength(30);
  });
  it("rejects reversed, empty and overlong ranges", () => {
    expect(getMrChartDates("2026-11-02", "2026-11-01")).toEqual([]);
    expect(getMrChartDates("", "2026-11-01")).toEqual([]);
    expect(getMrChartDates("2026-02-30", "2026-03-04")).toEqual([]);
    expect(getMrChartDates("2026-01-01", "2026-12-31")).toEqual([]);
  });
});

describe("MR chart statistics", () => {
  it("distinguishes missing data from zero and honors national holiday capacity", () => {
    const days = buildMrChartDays(["2026-11-06", "2026-11-07", "2026-11-08"],
      [{ date: "2026-11-07", type: DateEventType.NATIONAL }] as Holiday[],
      (date) => date === "2026-11-06" ? undefined : stats(date === "2026-11-07" ? 10 : 0));
    expect(days[0].percent).toBeNull();
    expect(days[1].percent).toBeCloseTo(30 / 77 * 100);
    expect(days[2]).toMatchObject({ sunday: true, percent: 0 });
    expect(summarizeMrChart(days, false, 60)).toMatchObject({ knownDays: 1, missingDays: 1, lowDays: 1 });
  });
  it("includes or excludes Sundays without changing the source days", () => {
    const days = [
      { date: "2026-11-07", sunday: false, percent: 80 },
      { date: "2026-11-08", sunday: true, percent: 20 },
      { date: "2026-11-09", sunday: false, percent: null },
    ];
    expect(summarizeMrChart(days, false, 60)).toMatchObject({ average: 80, lowDays: 0, missingDays: 1 });
    expect(summarizeMrChart(days, true, 60)).toMatchObject({ average: 50, lowDays: 1, missingDays: 1 });
  });
  it("uses raw percentages at warning boundaries and reports empty statistics honestly", () => {
    expect(summarizeMrChart([{ date: "2026-11-07", sunday: false, percent: 59.9 }], false, 60).lowDays).toBe(1);
    expect(summarizeMrChart([], false, 60)).toMatchObject({ average: null, highest: null, lowest: null, knownDays: 0 });
  });
});
