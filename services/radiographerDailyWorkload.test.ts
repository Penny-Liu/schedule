import { describe, expect, it } from "vitest";
import {
  buildChangedDailyWorkloadRecords,
  getDailyWorkloadFieldCycleRange,
  isDailyWorkloadFieldApplicableToCycle,
  mergeDailyWorkloadRecords,
} from "./radiographerDailyWorkload";

describe("daily radiographer workload editing", () => {
  it("keeps TSMC reports in the personal cycle while shifting only proofreader dates", () => {
    expect(
      getDailyWorkloadFieldCycleRange(
        "proofreader",
        "2026-08-26",
        "2026-09-25",
      ),
    ).toEqual({ startDate: "2026-08-21", endDate: "2026-09-20" });

    expect(
      getDailyWorkloadFieldCycleRange(
        "tsmcReport",
        "2026-08-26",
        "2026-09-25",
      ),
    ).toEqual({ startDate: "2026-08-26", endDate: "2026-09-25" });

    expect(
      isDailyWorkloadFieldApplicableToCycle(
        "proofreader",
        "2026-08-21",
        "2026-08-26",
        "2026-09-25",
      ),
    ).toBe(true);
    expect(
      isDailyWorkloadFieldApplicableToCycle(
        "tsmcReport",
        "2026-08-21",
        "2026-08-26",
        "2026-09-25",
      ),
    ).toBe(false);
    expect(
      isDailyWorkloadFieldApplicableToCycle(
        "tsmcReport",
        "2026-09-25",
        "2026-08-26",
        "2026-09-25",
      ),
    ).toBe(true);
  });

  it("creates a daily record only for the changed radiographer", () => {
    const records = buildChangedDailyWorkloadRecords(
      "2026-08-11",
      [
        { name: "甲", tsmcReport: 4 },
        { name: "乙", tsmcReport: 0 },
      ],
      [
        { name: "甲", tsmcReport: 0 },
        { name: "乙", tsmcReport: 0 },
      ],
    );

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      date: "2026-08-11",
      radiographerName: "甲",
      tsmcReport: 4,
    });
  });

  it("preserves an explicit change back to zero", () => {
    const records = buildChangedDailyWorkloadRecords(
      "2026-08-11",
      [{ name: "甲", tsmcReport: 0 }],
      [{ name: "甲", tsmcReport: 4 }],
    );

    expect(records[0]).toMatchObject({ tsmcReport: 0 });
  });

  it("saves a changed MR post-processing value", () => {
    const records = buildChangedDailyWorkloadRecords(
      "2026-08-11",
      [{ name: "甲", mrPostProcessing: 3 }],
      [{ name: "甲", mrPostProcessing: 0 }],
    );

    expect(records[0]).toMatchObject({ mrPostProcessing: 3 });
  });

  it("does not save unchanged rows", () => {
    expect(
      buildChangedDailyWorkloadRecords(
        "2026-08-11",
        [{ name: "甲", tsmcReport: 4 }],
        [{ name: "甲", tsmcReport: 4 }],
      ),
    ).toEqual([]);
  });

  it("merges returned database rows into the daily view", () => {
    const merged = mergeDailyWorkloadRecords(
      [
        {
          date: "2026-08-11",
          radiographerName: "甲",
          tsmcReport: 0,
        } as any,
      ],
      [
        {
          date: "2026-08-11",
          radiographerName: "甲",
          tsmcReport: 4,
        },
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].tsmcReport).toBe(4);
  });
});
