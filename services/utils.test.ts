import { describe, expect, it } from "vitest";
import type { User } from "../types";
import { StaffGroup, UserRole } from "../types";
import {
  EMPLOYMENT_PAUSE_KEY,
  countNonSundayDays,
  generateUUID,
  getEmploymentPause,
  getRoleLabel,
  hasBlockingSpecialRoles,
  isUserOnEmploymentPause,
  normalizeShiftForPersistence,
  toLocalISOString,
} from "./utils";

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: "user-1",
  name: "測試人員",
  username: "tester",
  role: UserRole.RADIOGRAPHER_STAFF,
  groupId: StaffGroup.GROUP_A,
  ...overrides,
});

describe("toLocalISOString", () => {
  it("formats local calendar components without UTC conversion", () => {
    expect(toLocalISOString(new Date(2026, 7, 6, 0, 30))).toBe("2026-08-06");
  });

  it("pads single digit months and days", () => {
    expect(toLocalISOString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("countNonSundayDays", () => {
  it("excludes Sundays from the half-open date range", () => {
    const monday = new Date(2026, 7, 3);
    const nextMonday = new Date(2026, 7, 10);
    expect(countNonSundayDays(monday, nextMonday)).toBe(6);
  });

  it("returns zero for an empty or reversed range", () => {
    const date = new Date(2026, 7, 6);
    expect(countNonSundayDays(date, date)).toBe(0);
    expect(countNonSundayDays(date, new Date(2026, 7, 5))).toBe(0);
  });
});

describe("employment pause helpers", () => {
  const user = makeUser({
    personalCycles: {
      [EMPLOYMENT_PAUSE_KEY]: {
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        memo: "留職停薪",
      },
    },
  });

  it("reads the configured pause", () => {
    expect(getEmploymentPause(user)).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      memo: "留職停薪",
    });
  });

  it("treats both boundary dates as paused", () => {
    expect(isUserOnEmploymentPause(user, "2026-08-01")).toBe(true);
    expect(isUserOnEmploymentPause(user, "2026-08-31")).toBe(true);
    expect(isUserOnEmploymentPause(user, "2026-09-01")).toBe(false);
  });
});

describe("role and special-role helpers", () => {
  it("uses the expected localized role label", () => {
    expect(getRoleLabel(UserRole.SYSTEM_ADMIN)).toBe("系統管理員");
  });

  it("ignores the non-blocking leave-cancellation marker", () => {
    expect(hasBlockingSpecialRoles(["配合銷假"])).toBe(false);
    expect(hasBlockingSpecialRoles(["配合銷假", "開機"])).toBe(true);
  });

  it("clears special tasks when a shift becomes off/leave", () => {
    const normalized = normalizeShiftForPersistence({
      id: "shift-1",
      userId: "user-1",
      date: "2026-08-10",
      station: "休假",
      specialRoles: ["開機", "晚班"],
      supportLocation: "北投",
    } as any);

    expect(normalized.specialRoles).toEqual([]);
    expect(normalized.supportLocation).toBeUndefined();
  });
});

describe("generateUUID", () => {
  it("returns an RFC 4122-shaped identifier", () => {
    expect(generateUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
