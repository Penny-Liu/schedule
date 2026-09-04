import { describe, expect, it } from "vitest";
import { calculateAgeOnDate } from "./radiographerAge";

describe("calculateAgeOnDate", () => {
  it("uses the report reference date instead of the export date", () => {
    expect(calculateAgeOnDate("1990-09-03", "2026-09-03")).toBe(36);
    expect(calculateAgeOnDate("1990-09-04", "2026-09-03")).toBe(35);
  });

  it("handles leap-day birthdays by calendar month and day", () => {
    expect(calculateAgeOnDate("2000-02-29", "2026-02-28")).toBe(25);
    expect(calculateAgeOnDate("2000-02-29", "2026-03-01")).toBe(26);
  });

  it("returns null for missing, malformed, impossible, or future dates", () => {
    expect(calculateAgeOnDate(null, "2026-09-03")).toBeNull();
    expect(calculateAgeOnDate("1990-02-30", "2026-09-03")).toBeNull();
    expect(calculateAgeOnDate("2027-01-01", "2026-09-03")).toBeNull();
  });
});
