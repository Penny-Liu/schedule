import { describe, expect, it } from "vitest";
import {
  calculateMrCapacityForecast,
  calculateMrScheduledSlots,
  formatMrCapacityStatus,
  formatMrPackageComposition,
} from "./mrCapacityForecast";

describe("MR capacity forecast", () => {
  it("calculates MR slots from the synchronized package counts", () => {
    expect(
      calculateMrScheduledSlots({
        beitou_clients: 0,
        beitou_cta: 0,
        dazhi_clients: 0,
        beitou_mr_large_male: 2,
        beitou_mr_large_female: 3,
        beitou_mr_medium: 4,
        beitou_mr_small: 5,
      }),
    ).toBe(68);
  });

  it("uses the requested green, yellow, and red thresholds", () => {
    expect(calculateMrCapacityForecast(71).level).toBe("green");
    expect(calculateMrCapacityForecast(72).level).toBe("yellow");
    expect(calculateMrCapacityForecast(86).level).toBe("yellow");
    expect(calculateMrCapacityForecast(87).level).toBe("red");
  });

  it("shows every MR package type, including zero counts", () => {
    const composition = formatMrPackageComposition({
        beitou_clients: 0,
        beitou_cta: 0,
        dazhi_clients: 0,
        beitou_mr_large_male: 3,
        beitou_mr_large_female: 4,
        beitou_mr_medium: 0,
        beitou_mr_small: 2,
      });

    expect(composition).toBe("3 男大、4 女大、0 中、2 小");
    expect(
      formatMrCapacityStatus(calculateMrCapacityForecast(69), composition),
    ).toContain("\n- 3 男大、4 女大、0 中、2 小\n");
    expect(
      formatMrCapacityStatus(calculateMrCapacityForecast(69), composition),
    ).not.toContain("已排組成");
  });

  it("estimates remaining large packages and single regions conservatively", () => {
    const forecast = calculateMrCapacityForecast(69);

    expect(forecast.remainingSlots).toBe(27);
    expect(forecast.availableLargePackages).toBe(3);
    expect(forecast.availableSingleRegions).toBe(9);
    expect(formatMrCapacityStatus(forecast)).toBe(
      "🟢 72% (已排 69 Slot)\n- 可安插 3 大套或 9 單部位",
    );
  });

  it("uses strict-control wording for red capacity", () => {
    expect(formatMrCapacityStatus(calculateMrCapacityForecast(90))).toBe(
      "🔴 94% (已排 90 Slot)\n- 滿載控管，僅餘特案 2 單部位",
    );
  });
});
