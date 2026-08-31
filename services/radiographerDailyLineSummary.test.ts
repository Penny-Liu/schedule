import { describe, expect, it } from "vitest";
import { formatRadiographerDailyLineSummary } from "./radiographerDailyLineSummary";

describe("radiographer daily line summary", () => {
  it("formats the requested Beitou workload fields and combines MR genders", () => {
    expect(
      formatRadiographerDailyLineSummary("2026-08-31", {
        beitou_clients: 42,
        beitou_cta: 6,
        dazhi_clients: 18,
        beitou_mr: 12,
        beitou_mr_large_male: 2,
        beitou_mr_large_female: 3,
        beitou_mr_medium: 4,
        beitou_mr_small: 3,
        beitou_ct: 15,
        beitou_ultrasound: 21,
        beitou_ultrasound_clients: 9,
        beitou_gi: 8,
      }),
    ).toBe(
      [
        "📅 8/31 w1",
        "",
        "客戶｜42位",
        "MR　｜12位（5大・4中・3小）",
        "CT　｜15位",
        "CTA ｜6位",
        "US　｜9位",
        "GI　｜8台",
      ].join("\n"),
    );
  });

  it("uses w7 for Sunday and defaults missing counts to zero", () => {
    expect(
      formatRadiographerDailyLineSummary("2026-09-06", {
        beitou_clients: 0,
        beitou_cta: 0,
        dazhi_clients: 0,
      }),
    ).toContain("📅 9/6 w7\n\n客戶｜0位\nMR　｜0位（0大・0中・0小）");
  });
});
