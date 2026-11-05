import { describe, expect, it } from "vitest";
import {
  formatImagingDoctorWorkloadLine,
  formatMrLowUtilizationSummary,
  normalizeRadiographerTodaySectionTemplate,
} from "./radiographerTodayLineSummary";

describe("radiographer today line summary", () => {
  it("formats imaging doctors with the weighted-unit suffix", () => {
    expect(
      formatImagingDoctorWorkloadLine("沈", {
        count_da_tao_5: 2,
        count_xiao_tao_4: 1,
        count_xiao_tao_3: 0,
        count_wu_2: 2,
        count_wu_1: 0,
        count_dazhi_1: 0,
      }),
    ).toBe("沈  5 (2大 1小 2無) →18 單位");

    expect(
      formatImagingDoctorWorkloadLine("韋", {
        count_da_tao_5: 2,
        count_xiao_tao_4: 1,
        count_xiao_tao_3: 0,
        count_wu_2: 2,
        count_wu_1: 1,
        count_dazhi_1: 0,
      }),
    ).toBe("韋  6 (2大 1小 3無) →19 單位");
  });

  it("normalizes saved legacy manpower templates to the requested layout", () => {
    expect(
      normalizeRadiographerTodaySectionTemplate(`{{date}}
{{imaging_doctors}}

放射師人力
北投：{{beitou_count}} (客戶：{{beitou_clients}}  CTA  {{beitou_cta}})
BU領頭 場控：{{floor_control}}
輔班：{{assist}}
排班：{{scheduler}}
MR：{{mr}}
US : {{us}}
CT：{{ct}}
BMD： {{bmd}}
{{support_section}}{{learning_section}}`),
    ).toBe(`{{date}}
{{imaging_doctors}}

放射師人力
北投：{{beitou_count}} (客戶：{{beitou_clients}}  CTA：{{beitou_cta}})
場控：{{floor_control}}
MR : {{mr}}
US：{{us}}
CT: {{ct}}
BMD :{{bmd}}
{{support_section}}{{learning_section}}`);
  });
});

describe("MR low utilization promotion", () => {
  it("selects the lowest five and presents them chronologically with the requested copy", () => {
    const result = formatMrLowUtilizationSummary([
      { date: "2026-11-20", utilizationPercent: 39 },
      { date: "2026-11-11", utilizationPercent: 42 },
      { date: "2026-11-18", utilizationPercent: 42 },
      { date: "2026-11-10", utilizationPercent: 90 },
      { date: "2026-11-12", utilizationPercent: 0 },
      { date: "2026-11-13", utilizationPercent: 20 },
    ]);
    expect(result.split("\n").filter((line) => line.startsWith("👉"))).toEqual([
      "👉 11/11 (三) 42%",
      "👉 11/12 (四) 0%",
      "👉 11/13 (五) 20%",
      "👉 11/18 (三) 42%",
      "👉 11/20 (五) 39%",
    ]);
    expect(result).toContain("優先引導至「🔥 或上述日期」");
    expect(result).toContain("大家一起幫忙把離峰時段填滿、拉高整體MR運用率！謝謝大家！");
  });

  it("does not generate a booking appeal when there is no data", () => {
    expect(formatMrLowUtilizationSummary([])).toBe("未來20天內，排除週日後尚無可用的 MR 排程資料。");
    expect(formatMrLowUtilizationSummary([{ date: "2026-11-11", utilizationPercent: 42 }])
      .split("\n").filter((line) => line.startsWith("👉"))).toHaveLength(1);
  });
});
