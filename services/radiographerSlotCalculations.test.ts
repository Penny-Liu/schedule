import { describe, expect, it } from "vitest";
import { calculateBmdSlots } from "./radiographerSlotCalculations";

describe("radiographer BMD slot calculation", () => {
  it("counts one slot for each BMD order", () => {
    expect(calculateBmdSlots(0)).toBe(0);
    expect(calculateBmdSlots(1)).toBe(1);
    expect(calculateBmdSlots(12)).toBe(12);
  });

  it("normalizes invalid or negative values to zero", () => {
    expect(calculateBmdSlots(Number.NaN)).toBe(0);
    expect(calculateBmdSlots(-3)).toBe(0);
  });
});
