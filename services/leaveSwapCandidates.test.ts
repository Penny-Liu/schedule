import { describe, expect, it } from "vitest";
import { StaffGroup, UserRole, type User } from "../types";
import { isEligibleLeaveSwapCandidate } from "./leaveSwapCandidates";

const user: User = {
  id: "coworker", name: "同事", username: "coworker",
  role: UserRole.RADIOGRAPHER_STAFF, groupId: StaffGroup.GROUP_B, isRadiographer: true,
};
const eligible = (overrides: Partial<User>, dates = ["2026-10-13"]) =>
  isEligibleLeaveSwapCandidate({ ...user, ...overrides }, "requester", dates);

describe("leave swap employment eligibility", () => {
  it("excludes resigned people even when their schedule status is OFF", () => {
    expect(eligible({ isActive: false })).toBe(false);
    expect(eligible({ isActive: false, resignationDate: "2026-09-30" })).toBe(false);
    expect(eligible({ resignationDate: "2026-10-12" })).toBe(false);
  });

  it("keeps active radiographers, including older records without isActive", () => {
    expect(eligible({})).toBe(true);
    expect(eligible({ isActive: true })).toBe(true);
    expect(eligible({ isRadiographer: false })).toBe(false);
    expect(eligible({ id: "requester" })).toBe(false);
  });

  it("requires employment on both exchange dates", () => {
    expect(eligible({ hireDate: "2026-10-14" })).toBe(false);
    expect(eligible({ resignationDate: "2026-10-15" }, ["2026-10-13", "2026-10-16"])).toBe(false);
  });

  it("excludes radiographer assistants even when marked as active radiographers", () => {
    expect(eligible({ role: UserRole.RADIOGRAPHER_ASSISTANT, isActive: true, isRadiographer: true })).toBe(false);
  });
});
