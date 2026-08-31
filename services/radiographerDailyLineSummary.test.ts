import { describe, expect, it } from "vitest";
import { formatRadiographerDailyLineSummary } from "./radiographerDailyLineSummary";

describe("radiographer daily line summary", () => {
  it("formats the requested Beitou workload fields and combines MR genders", () => {
    expect(
      formatRadiographerDailyLineSummary("2026-09-01", {
        beitou_clients: 16,
        beitou_cta: 2,
        dazhi_clients: 18,
        beitou_mr: 8,
        beitou_mr_large_male: 2,
        beitou_mr_large_female: 3,
        beitou_mr_medium: 1,
        beitou_mr_small: 2,
        beitou_ct: 12,
        beitou_ultrasound: 21,
        beitou_ultrasound_clients: 10,
        beitou_gi: 10,
      }),
    ).toBe(
      [
        "9/1 w2",
        "",
        "解說：16人",
        "MR：8人（5大・1中・2小）",
        "CT：12人",
        "CTA：2人",
        "US：10人",
        "GI：10台",
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
    ).toContain("9/6 w7\n\n解說：0人\nMR：0人（0大・0中・0小）");
  });
});
