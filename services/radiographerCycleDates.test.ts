import { describe, expect, it } from "vitest";
import type { RosterCycle } from "../types";
import {
  getRadiographerCycleMonthKey,
  getRadiographerDefaultDatesForMonth,
} from "./radiographerCycleDates";

const january: RosterCycle = {
  id: "2027-01", name: "2027/01", startDate: "2027-01-01",
  endDate: "2027-01-29", isConfirmed: true,
};
const february: RosterCycle = {
  id: "2027-02", name: "2027/02", startDate: "2027-01-30",
  endDate: "2027-03-04",
};

describe("radiographer personal cycle defaults", () => {
  it("matches the Chinese cycle names stored in production, including the second January start", () => {
    const first = { ...january, name: "2027年第01週期" };
    const second = { ...february, name: "2027年第02週期" };
    for (const cycles of [[second, first], [first, second]]) {
      expect(getRadiographerDefaultDatesForMonth("2027-01", cycles)).toEqual({
        startDate: "2027-01-01", endDate: "2027-01-29",
      });
      expect(getRadiographerDefaultDatesForMonth("2027-02", cycles)).toEqual({
        startDate: "2027-01-30", endDate: "2027-03-04",
      });
    }
    expect(getRadiographerCycleMonthKey(second)).toBe("2027-02");
  });

  it("accepts single-digit Chinese cycle numbers and a preceding-year start", () => {
    const cycle = { ...january, name: "2027年第1週期", startDate: "2026-12-31" };
    expect(getRadiographerCycleMonthKey(cycle)).toBe("2027-01");
    expect(getRadiographerDefaultDatesForMonth("2027-01", [february, cycle])).toEqual({
      startDate: "2026-12-31", endDate: "2027-01-29",
    });
  });

  it("uses cycle 01 when two cycles start in January, regardless of ordering", () => {
    for (const cycles of [[february, january], [january, february]]) {
      expect(getRadiographerDefaultDatesForMonth("2027-01", cycles)).toEqual({
        startDate: "2027-01-01", endDate: "2027-01-29",
      });
      expect(getRadiographerDefaultDatesForMonth("2027-02", cycles)).toEqual({
        startDate: "2027-01-30", endDate: "2027-03-04",
      });
    }
  });

  it("uses the named cycle even when it starts in the preceding year", () => {
    const crossYear = { ...january, startDate: "2026-12-31" };
    expect(getRadiographerDefaultDatesForMonth("2027-01", [february, crossYear])).toEqual({
      startDate: "2026-12-31", endDate: "2027-01-29",
    });
  });

  it("normalizes a single-digit cycle name for defaults and saved personal settings", () => {
    const cycle = { ...february, name: "2027/2" };
    expect(getRadiographerCycleMonthKey(cycle)).toBe("2027-02");
    expect(getRadiographerDefaultDatesForMonth("2027-02", [cycle])).toEqual({
      startDate: "2027-01-30", endDate: "2027-03-04",
    });
  });

  it("retains start-month and overlap fallbacks for custom cycle names", () => {
    const cycle = { ...february, name: "春節排班" };
    expect(getRadiographerCycleMonthKey(cycle)).toBe("2027-01");
    for (const month of ["2027-01", "2027-02"]) {
      expect(getRadiographerDefaultDatesForMonth(month, [cycle])).toEqual({
        startDate: "2027-01-30", endDate: "2027-03-04",
      });
    }
  });

  it("uses calendar month boundaries when no cycle matches", () => {
    expect(getRadiographerDefaultDatesForMonth("2028-02", [january, february])).toEqual({
      startDate: "2028-02-01", endDate: "2028-02-29",
    });
    expect(getRadiographerDefaultDatesForMonth("2027-12", [])).toEqual({
      startDate: "2027-12-01", endDate: "2027-12-31",
    });
  });
});
