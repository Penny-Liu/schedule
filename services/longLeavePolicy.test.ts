import { describe, expect, it } from "vitest";
import {
  getLongLeaveApplicationMinDate,
  getLongLeaveApplicationError,
  isLongLeaveBeyondReviewWindow,
} from "./longLeavePolicy";

// 刻意使用跨月、不等長且倒序的共同週期。
const cycles = [
  { startDate: "2027-03-05", endDate: "2027-04-03" },
  { startDate: "2027-01-30", endDate: "2027-03-04" },
  { startDate: "2027-01-01", endDate: "2027-01-29" },
  { startDate: "2026-12-03", endDate: "2026-12-31" },
  { startDate: "2026-11-03", endDate: "2026-12-02" },
  { startDate: "2026-10-04", endDate: "2026-11-02" },
];

describe("long leave roster-cycle policy", () => {
  it.each(["2026-10-04T00:00:00+08:00", "2026-11-02T23:59:59+08:00"])(
    "locks the current and next two complete cycles (%s)", (timestamp) => {
      const now = new Date(timestamp);
      expect(getLongLeaveApplicationMinDate(cycles, now)).toBe("2027-01-01");
      for (const date of ["2026-10-04", "2026-11-03", "2026-12-02", "2026-12-03", "2026-12-31"]) {
        expect(getLongLeaveApplicationError(date, cycles, now)).not.toBeNull();
      }
      expect(getLongLeaveApplicationError("2027-01-01", cycles, now)).toBeNull();
      expect(isLongLeaveBeyondReviewWindow("2026-12-31", cycles, now)).toBe(false);
      expect(isLongLeaveBeyondReviewWindow("2027-01-01", cycles, now)).toBe(true);
    },
  );

  it("moves the lock at the cycle boundary, rather than the month boundary", () => {
    const now = new Date("2026-11-03T00:00:00+08:00");
    expect(getLongLeaveApplicationMinDate(cycles, now)).toBe("2027-01-30");
    expect(getLongLeaveApplicationError("2027-01-29", cycles, now)).not.toBeNull();
    expect(getLongLeaveApplicationError("2027-01-30", cycles, now)).toBeNull();
    expect(isLongLeaveBeyondReviewWindow("2027-01-29", cycles, now)).toBe(false);
  });

  it("changes the lock at Taiwan midnight on a cycle boundary", () => {
    expect(getLongLeaveApplicationMinDate(cycles, new Date("2026-11-02T15:59:59Z"))).toBe("2027-01-01");
    expect(getLongLeaveApplicationMinDate(cycles, new Date("2026-11-02T16:00:00Z"))).toBe("2027-01-30");
  });

  it("uses the actual long cross-month cycle end", () => {
    expect(getLongLeaveApplicationMinDate(cycles, new Date("2026-12-03T12:00:00+08:00"))).toBe("2027-03-05");
  });

  it("does not mutate the stored order", () => {
    const original = cycles.map((cycle) => cycle.startDate);
    getLongLeaveApplicationMinDate(cycles, new Date("2026-10-27T12:00:00+08:00"));
    expect(cycles.map((cycle) => cycle.startDate)).toEqual(original);
  });

  it("blocks new applications if the current or next two cycles are missing", () => {
    for (const now of [new Date("2026-09-01T12:00:00+08:00"), new Date("2027-03-05T12:00:00+08:00")]) {
      expect(getLongLeaveApplicationMinDate(cycles, now)).toBeNull();
      expect(getLongLeaveApplicationError("2027-06-01", cycles, now)).toContain("尚未完整設定");
      expect(isLongLeaveBeyondReviewWindow("2027-06-01", cycles, now)).toBe(false);
    }
  });

  it("rejects a gap or overlap instead of locking the wrong cycles", () => {
    const now = new Date("2026-10-27T12:00:00+08:00");
    for (const startDate of ["2026-11-04", "2026-11-02"]) {
      const invalid = cycles.map((cycle) => cycle.startDate === "2026-11-03" ? { ...cycle, startDate } : cycle);
      expect(getLongLeaveApplicationMinDate(invalid, now)).toBeNull();
    }
    expect(getLongLeaveApplicationMinDate([...cycles, cycles[5]], now)).toBeNull();
  });
});
