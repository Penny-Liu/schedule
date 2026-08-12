import { describe, expect, it } from "vitest";
import type { Shift, User } from "../types";
import {
  canTeachLearningCategory,
  getLearningTeacherCandidates,
  matchesLearningCategory,
} from "./radiographerLearning";

const user = (overrides: Partial<User>): User => ({
  id: "user",
  name: "測試人員",
  username: "tester",
  role: "RADIOGRAPHER" as User["role"],
  groupId: "A" as User["groupId"],
  isActive: true,
  isRadiographer: true,
  capabilities: [],
  learningCapabilities: [],
  ...overrides,
});

const shift = (overrides: Partial<Shift>): Shift => ({
  id: "shift",
  userId: "user",
  date: "2026-08-12",
  station: "US1",
  specialRoles: [],
  ...overrides,
});

describe("radiographer learning teacher candidates", () => {
  it("matches an ultrasound learning category to US stations", () => {
    expect(matchesLearningCategory("US1", "超音波")).toBe(true);
    expect(matchesLearningCategory("US4", "心超")).toBe(true);
  });

  it("allows a certified radiographer but excludes an active learner", () => {
    expect(
      canTeachLearningCategory(
        user({ capabilities: ["US1"] }),
        "超音波",
        "2026-08-12",
      ),
    ).toBe(true);
    expect(
      canTeachLearningCategory(
        user({
          capabilities: ["US1"],
          learningCapabilities: ["US2"],
        }),
        "超音波",
        "2026-08-12",
      ),
    ).toBe(false);
  });

  it("lists working qualified teachers even when their assigned station differs", () => {
    const candidates = getLearningTeacherCandidates(
      [
        user({ id: "student", name: "學員" }),
        user({ id: "teacher-us", name: "US老師", capabilities: ["US1"] }),
        user({ id: "teacher-admin", name: "行政老師", capabilities: ["US2"] }),
        user({ id: "off-teacher", name: "休假老師", capabilities: ["US3"] }),
      ],
      [
        shift({ userId: "student", station: "CT" }),
        shift({ userId: "teacher-us", station: "US1" }),
        shift({ userId: "teacher-admin", station: "行政" }),
        shift({ userId: "off-teacher", station: "休假" }),
      ],
      "student",
      "2026-08-12",
      "超音波",
    );

    expect(candidates.map(({ user: candidate }) => candidate.id)).toEqual([
      "teacher-us",
      "teacher-admin",
    ]);
  });
});
