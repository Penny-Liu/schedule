import { describe, expect, it } from "vitest";
import {
  getAutomaticMrTeachingAmount,
  normalizeMrTeachingAmount,
} from "./radiographerMrTeaching";

describe("MR teaching remainder", () => {
  const assignments = [
    { teacher: "葉美彤", workloadField: "mrLargeMale", amount: 1 },
    { teacher: "鍾采霓", workloadField: "mrLargeFemale", amount: 0.7 },
  ];

  it("credits the 9/7 remainder to the sole schedule teacher without changing manual assignments", () => {
    const original = structuredClone(assignments);
    const actual = { mr: 42, mrLargeMale: 3, mrLargeFemale: 1, mrMedium: 0, mrSmall: 1 };
    const automatic = Object.fromEntries(Object.entries(actual).map(([field, amount]) => [
      field, getAutomaticMrTeachingAmount(field, amount, assignments, 1),
    ]));
    expect(automatic).toEqual({ mr: 42, mrLargeMale: 2, mrLargeFemale: 0.3, mrMedium: 0, mrSmall: 1 });
    for (const [field, amount] of Object.entries(actual)) {
      const manual = assignments.filter((item) => item.workloadField === field)
        .reduce((sum, item) => sum + item.amount, 0);
      expect(normalizeMrTeachingAmount(automatic[field] + manual)).toBe(amount);
    }
    expect(assignments).toEqual(original);
  });

  it("does not infer a recipient for partial assignments when there is no unique teacher", () => {
    for (const teachers of [0, 2, 3]) {
      expect(getAutomaticMrTeachingAmount("mrLargeMale", 3, assignments, teachers)).toBe(0);
      expect(getAutomaticMrTeachingAmount("mr", 42, assignments, teachers)).toBe(0);
    }
  });

  it("preserves automatic sharing when there are no manual MR assignments", () => {
    expect(getAutomaticMrTeachingAmount("mr", 42, [], 1)).toBe(42);
    expect(getAutomaticMrTeachingAmount("mr", 42, [], 2)).toBe(21);
    expect(getAutomaticMrTeachingAmount("mr", 42, [{ workloadField: "us", amount: 1 }], 2)).toBe(21);
  });

  it("subtracts all teachers' assignments to the same field and never allocates a negative remainder", () => {
    const manual = [
      { workloadField: "mrLargeFemale", amount: 0.7 },
      { workloadField: "mrLargeFemale", amount: 0.2 },
    ];
    expect(getAutomaticMrTeachingAmount("mrLargeFemale", 1, manual, 1)).toBe(0.1);
    expect(getAutomaticMrTeachingAmount("mrLargeFemale", 0.5, manual, 1)).toBe(0);
    expect(getAutomaticMrTeachingAmount("mrLargeFemale", 0.9, manual, 1)).toBe(0);
  });

  it("preserves fractional monthly credit", () => {
    expect(normalizeMrTeachingAmount(0.7)).toBe(0.7);
    expect(normalizeMrTeachingAmount(0.3 + 0.6)).toBe(0.9);
  });
});
