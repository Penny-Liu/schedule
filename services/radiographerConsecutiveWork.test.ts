import { describe, expect, it } from "vitest";
import { getConsecutiveWorkCheckDates, getConsecutiveWorkWarnings } from "./radiographerConsecutiveWork";

describe("radiographer consecutive work warnings", () => {
  const dates = getConsecutiveWorkCheckDates(["2027-01-01", "2027-01-02", "2027-01-03"]);

  it("includes six preceding days across month and year boundaries", () => {
    expect(dates).toHaveLength(9);
    expect(dates[0]).toBe("2026-12-26");
    expect(getConsecutiveWorkCheckDates([])).toEqual([]);
  });

  it("warns only from the seventh working day, including unassigned working days", () => {
    expect([...getConsecutiveWorkWarnings(dates, () => true)]).toEqual([
      "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
    expect(getConsecutiveWorkWarnings(dates.slice(0, 6), () => true).size).toBe(0);
  });

  it("resets after rest or a date before employment", () => {
    expect([...getConsecutiveWorkWarnings(dates, (date) => date !== "2027-01-02")]).toEqual(["2027-01-01"]);
    expect(getConsecutiveWorkWarnings(dates, (date) => date >= "2027-01-01").size).toBe(0);
  });
});
