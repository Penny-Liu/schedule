import { describe, expect, it } from "vitest";
import {
  GROUP_D_BALANCED_ROTATION,
  GROUP_D_BALANCED_ROTATION_EFFECTIVE_DATE,
  getGroupDRestIndex,
  getGroupDRestIndexForDate,
} from "./groupDRotation";
import { countNonSundayDays } from "./utils";

describe("Group D four-week balanced rotation", () => {
  it("uses the agreed four-week table", () => {
    expect([...GROUP_D_BALANCED_ROTATION]).toEqual([
      0, 1, 2, 3, 0, 1,
      3, 2, 0, 1, 3, 2,
      1, 0, 3, 2, 1, 0,
      2, 3, 1, 0, 2, 3,
    ]);
  });

  it("gives every person six rests covering all six weekday positions", () => {
    for (let index = 0; index < 4; index += 1) {
      const positions = GROUP_D_BALANCED_ROTATION.flatMap((restIndex, day) =>
        restIndex === index ? [day] : [],
      );
      expect(positions).toHaveLength(6);
      expect([...new Set(positions.map((day) => day % 6))].sort()).toEqual([
        0, 1, 2, 3, 4, 5,
      ]);
    }
  });

  it("keeps cyclic rest gaps between three and five non-Sunday days", () => {
    for (let index = 0; index < 4; index += 1) {
      const positions = GROUP_D_BALANCED_ROTATION.flatMap((restIndex, day) =>
        restIndex === index ? [day] : [],
      );
      const gaps = positions.map((position, occurrence) => {
        const next = positions[(occurrence + 1) % positions.length];
        return (next - position + GROUP_D_BALANCED_ROTATION.length) %
          GROUP_D_BALANCED_ROTATION.length;
      });
      expect(gaps.every((gap) => gap >= 3 && gap <= 5)).toBe(true);
    }
  });

  it("repeats after 24 non-Sunday days", () => {
    for (let day = 0; day < 24; day += 1) {
      expect(getGroupDRestIndex(day + 24)).toBe(getGroupDRestIndex(day));
    }
  });

  it("rejects invalid counters", () => {
    expect(() => getGroupDRestIndex(-1)).toThrow(RangeError);
    expect(() => getGroupDRestIndex(1.5)).toThrow(RangeError);
  });

  it("keeps the original modulo-four result before the effective date", () => {
    const cycleStartDate = "2025-11-06";
    const dateStr = "2026-11-02";
    const expectedLegacyIndex =
      countNonSundayDays(
        new Date(`${cycleStartDate}T00:00:00`),
        new Date(`${dateStr}T00:00:00`),
      ) % 4;

    expect(getGroupDRestIndexForDate(dateStr, cycleStartDate)).toBe(
      expectedLegacyIndex,
    );
  });

  it("starts the balanced cycle from index zero on 2026-11-03", () => {
    expect(GROUP_D_BALANCED_ROTATION_EFFECTIVE_DATE).toBe("2026-11-03");
    expect(getGroupDRestIndexForDate("2026-11-03", "2025-11-06")).toBe(0);
    expect(getGroupDRestIndexForDate("2026-11-04", "2025-11-06")).toBe(1);
    expect(getGroupDRestIndexForDate("2026-11-05", "2025-11-06")).toBe(2);
  });
});
