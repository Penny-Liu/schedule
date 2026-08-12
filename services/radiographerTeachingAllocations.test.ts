import { describe, expect, it } from "vitest";
import {
  getTeachingCategoryForField,
  validateTeachingAllocations,
} from "./radiographerTeachingAllocations";

describe("radiographer teaching allocations", () => {
  it("maps detailed ultrasound fields to the ultrasound learning category", () => {
    expect(getTeachingCategoryForField("usHeart")).toBe("超音波");
    expect(getTeachingCategoryForField("cta")).toBe("CT");
  });

  it("allows multiple teachers when their combined amount is within the daily count", () => {
    const errors = validateTeachingAllocations(
      [
        { date: "2026-08-12", studentUserId: "student", teacherUserId: "a", workloadField: "usHeart", amount: 3 },
        { date: "2026-08-12", studentUserId: "student", teacherUserId: "b", workloadField: "usHeart", amount: 2 },
      ],
      { "2026-08-12": { usHeart: 5 } },
    );
    expect(errors).toEqual([]);
  });

  it("rejects a combined amount above the student's daily workload", () => {
    const errors = validateTeachingAllocations(
      [
        { date: "2026-08-12", studentUserId: "student", teacherUserId: "a", workloadField: "usHeart", amount: 3 },
        { date: "2026-08-12", studentUserId: "student", teacherUserId: "b", workloadField: "usHeart", amount: 3 },
      ],
      { "2026-08-12": { usHeart: 5 } },
    );
    expect(errors).toContain("2026-08-12 心超 分配 6 件，超過當日實際工作量 5 件");
  });

  it("rejects duplicate rows for the same teacher and inspection type", () => {
    const errors = validateTeachingAllocations(
      [
        { date: "2026-08-12", studentUserId: "student", teacherUserId: "a", workloadField: "usHeart", amount: 2 },
        { date: "2026-08-12", studentUserId: "student", teacherUserId: "a", workloadField: "usHeart", amount: 1 },
      ],
      { "2026-08-12": { usHeart: 5 } },
    );
    expect(errors).toContain("第 2 筆與前面的日期、項目及老師重複");
  });
});
