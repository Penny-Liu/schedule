import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffGroup, StationDefault, UserRole, type Shift, type User } from "../types";
import { db } from "./store";
import { getRadiographerStatisticsMonths, loadRadiographerStatisticsMonths } from "./radiographerStatisticsData";

const defaultRange = { startDate: "2026-09-04", endDate: "2026-10-03" };
const personalRange = { startDate: "2026-08-25", endDate: "2026-10-05", memo: "" };
const user: User = {
  id: "test-person", name: "跨月人員", username: "test-person",
  role: UserRole.RADIOGRAPHER_STAFF, groupId: StaffGroup.GROUP_B,
  isRadiographer: true, personalCycles: { "2026-09": personalRange },
};

afterEach(() => { vi.restoreAllMocks(); });

describe("statistics cycle data coverage", () => {
  it("loads the earlier personal start and later personal end, across year boundaries too", () => {
    expect(getRadiographerStatisticsMonths(defaultRange, "2026-09", [user])).toEqual([
      "2026-08", "2026-09", "2026-10",
    ]);
    expect(getRadiographerStatisticsMonths(
      { startDate: "2027-01-01", endDate: "2027-01-29" }, "2027-01",
      [{ personalCycles: { "2027-01": { startDate: "2026-12-15", endDate: "2027-02-05", memo: "" } } }],
    )).toEqual(["2026-12", "2027-01", "2027-02"]);
  });

  it("ignores other personal months and incomplete date edits", () => {
    expect(getRadiographerStatisticsMonths(defaultRange, "2026-10", [user])).toEqual(["2026-09", "2026-10"]);
    expect(getRadiographerStatisticsMonths(defaultRange, "2026-09", [
      { personalCycles: { "2026-09": { startDate: "", endDate: "2026-10-05", memo: "" } } },
    ])).toEqual(["2026-09", "2026-10"]);
  });

  it("does not report completion when a required month fails", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline"));
    await expect(loadRadiographerStatisticsMonths(["2026-08", "2026-09"], load)).rejects.toThrow("offline");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("restores both 14 scheduled days and 19 statistical days to 20 after loading August", async () => {
    // Sanitized dates from the reported 42-day cycle. August 28 is an explicit
    // work assignment on a rotation rest day and cannot be inferred from B-group.
    const workDates = [
      "2026-08-25", "2026-08-26", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31",
      "2026-09-01", "2026-09-04", "2026-09-05", "2026-09-08", "2026-09-09", "2026-09-10",
      "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-16", "2026-09-17",
      "2026-10-01", "2026-10-04", "2026-10-05",
    ];
    const offDates = ["2026-09-06", "2026-09-07",
      ...Array.from({ length: 13 }, (_, index) => `2026-09-${18 + index}`)];
    const allShifts: Shift[] = [...workDates, ...offDates].map((date) => ({
      id: date, userId: user.id, date,
      station: offDates.includes(date) ? StationDefault.OFF : "US2",
      specialRoles: date === "2026-08-28" ? ["配合銷假"] : [],
    }));
    const previous = { users: db.users, shifts: db.shifts, settings: db.settings, leaves: db.leaves };
    db.users = [user];
    db.shifts = allShifts.filter((shift) => shift.date >= "2026-09-01");
    db.settings = { ...db.settings, cycleStartDate: "2026-02-26", cycleAnchors: [], holidays: [] };
    db.leaves = [];
    const dates = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 7, 25 + index));
      return date.toISOString().slice(0, 10);
    });
    const scheduled = () => db.shifts.filter((shift) => shift.station !== StationDefault.OFF).length;
    const statistical = () => dates.filter((date) => db.getUserStatusOnDate(user.id, date) === "WORK").length;
    try {
      expect(scheduled()).toBe(14);
      expect(statistical()).toBe(19);
      expect(db.getUserStatusOnDate(user.id, "2026-08-28")).toBe("OFF");
      const load = vi.fn(async (year: number, month: number) => {
        const prefix = `${year}-${String(month).padStart(2, "0")}`;
        db.shifts = [...db.shifts.filter((shift) => !shift.date.startsWith(prefix)),
          ...allShifts.filter((shift) => shift.date.startsWith(prefix))];
      });
      await loadRadiographerStatisticsMonths(getRadiographerStatisticsMonths(defaultRange, "2026-09", [user]), load);
      expect(load.mock.calls).toEqual([[2026, 8], [2026, 9], [2026, 10]]);
      expect(scheduled()).toBe(20);
      expect(statistical()).toBe(20);
      expect(db.getUserStatusOnDate(user.id, "2026-08-28")).toBe("WORK");
      expect(user.personalCycles?.["2026-09"]).toEqual(personalRange);
    } finally {
      Object.assign(db, previous);
    }
  });
});
