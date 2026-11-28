import { describe, expect, it } from "vitest";
import { getPhysicianWorkloadCounts } from "./physician-workload-counts.mjs";

describe("physician workload category counts", () => {
  it("includes large packages without special CT in the displayed large-package count", () => {
    expect(
      getPhysicianWorkloadCounts({
        "大套5": 1,
        "大套5(無特檢)": 1,
        "小套4": 2,
        "無1": 3,
      }),
    ).toEqual({
      count_da_tao_5: 2,
      count_xiao_tao_4: 2,
      count_xiao_tao_3: 0,
      count_wu_2: 0,
      count_wu_1: 3,
      count_dazhi_1: 0,
    });
  });
});
