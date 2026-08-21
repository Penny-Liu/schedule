import { describe, expect, it } from "vitest";
import {
  calculateMrCapacityForecast,
  calculateMrScheduledSlots,
  formatMrCapacityStatus,
  formatMrPackageComposition,
  getMrCapacitySlotsForDate,
  MR_REDUCED_CAPACITY_SLOTS,
} from "./mrCapacityForecast";
import { DateEventType } from "../types";

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

  it("uses an eight-tenths capacity of 77 slots on Sunday", () => {
    expect(MR_REDUCED_CAPACITY_SLOTS).toBe(77);

    const sundayForecast = calculateMrCapacityForecast(
      56,
      MR_REDUCED_CAPACITY_SLOTS,
    );
    expect(sundayForecast.capacitySlots).toBe(77);
    expect(sundayForecast.utilizationPercent).toBe(73);
    expect(sundayForecast.remainingSlots).toBe(21);
    expect(sundayForecast.level).toBe("green");
    expect(sundayForecast.schedulingLimitSlots).toBeCloseTo(69.3);
    expect(sundayForecast.availableLargePackages).toBe(1);
    expect(sundayForecast.availableSingleRegions).toBe(4);
  });

  it("uses the reduced capacity on configured national holidays", () => {
    const holidays = [
      {
        date: "2026-08-19",
        name: "測試國定假日",
        type: DateEventType.NATIONAL,
      },
      {
        date: "2026-08-20",
        name: "測試休診",
        type: DateEventType.CLOSED,
      },
    ];

    expect(getMrCapacitySlotsForDate("2026-08-16", [])).toBe(77);
    expect(getMrCapacitySlotsForDate("2026-08-19", holidays)).toBe(77);
    expect(getMrCapacitySlotsForDate("2026-08-20", holidays)).toBe(96);
    expect(getMrCapacitySlotsForDate("2026-08-21", holidays)).toBe(96);
  });

  it("omits MR package types with zero counts", () => {
    const composition = formatMrPackageComposition({
        beitou_clients: 0,
        beitou_cta: 0,
        dazhi_clients: 0,
        beitou_mr_large_male: 3,
        beitou_mr_large_female: 4,
        beitou_mr_medium: 0,
        beitou_mr_small: 2,
      });

    expect(composition).toBe("3 男大、4 女大、2 小");
    expect(
      formatMrCapacityStatus(calculateMrCapacityForecast(69), composition),
    ).toContain("\n排程：\n- 3男大  4女大  2小\n");
    expect(
      formatMrCapacityStatus(calculateMrCapacityForecast(69), composition),
    ).not.toContain("已排組成");
  });

  it("estimates remaining large packages and single regions conservatively", () => {
    const forecast = calculateMrCapacityForecast(69);

    expect(forecast.remainingSlots).toBe(27);
    expect(forecast.schedulingLimitSlots).toBeCloseTo(86.4);
    expect(forecast.schedulableSlots).toBeCloseTo(17.4);
    expect(forecast.availableLargePackages).toBe(1);
    expect(forecast.availableSingleRegions).toBe(5);
    expect(formatMrCapacityStatus(forecast)).toBe(
      "運用率72% (69 Slot)\n- 再安插1大套或5單部位",
    );
  });

  it("does not recommend additions beyond the ninety-percent target", () => {
    expect(formatMrCapacityStatus(calculateMrCapacityForecast(84))).toBe(
      "運用率88% (84 Slot)",
    );
  });
});
