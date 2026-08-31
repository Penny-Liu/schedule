import { describe, expect, it } from "vitest";
import {
  formatImagingDoctorWorkloadLine,
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
