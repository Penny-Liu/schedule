import { describe, expect, it } from "vitest";
import { omitManualDailyWorkloadFields } from "./radiographer-daily-sync.mjs";

describe("radiographer daily workload synchronization", () => {
  it("never sends the manually entered TSMC report count", () => {
    const payload = omitManualDailyWorkloadFields({
      date: "2026-08-11",
      radiographer_name: "劉雅萍",
      ct: 3,
      tsmc_report: 4,
      total: 7,
      last_updated: "2026-08-11T10:00:00Z",
    });

    expect(payload).toEqual({
      date: "2026-08-11",
      radiographer_name: "劉雅萍",
      ct: 3,
    });
    expect(payload).not.toHaveProperty("tsmc_report");
    expect(payload).not.toHaveProperty("total");
    expect(payload).not.toHaveProperty("last_updated");
  });
});
