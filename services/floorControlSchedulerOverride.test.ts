import { describe, expect, it } from "vitest";
import { SPECIAL_ROLES as R } from "../types";
import { getFloorControlRoleDecision as decide } from "./floorControlSchedulerOverride";

describe("manual floor-control scheduler exception", () => {
  it("requires an explicit one-shift exception to add scheduler", () => {
    expect(decide("場控", R.SCHEDULER, [], false)).toBe("CONFIRM_SCHEDULER");
    expect(decide("北投場控", R.SCHEDULER, ["配合銷假"], false)).toBe("CONFIRM_SCHEDULER");
  });
  it("keeps ordinary tasks blocked on weekdays", () => {
    for (const role of [R.OPENING, R.LATE, R.ASSIST]) {
      expect(decide("場控", role, [], false)).toBe("BLOCK");
    }
  });
  it("allows removing an existing scheduler assignment", () => {
    expect(decide("場控", R.SCHEDULER, [R.SCHEDULER], false)).toBe("ALLOW");
  });
  it("preserves holiday, non-floor-control and leave-marker behavior", () => {
    expect(decide("場控", R.OPENING, [], true)).toBe("ALLOW");
    expect(decide("MR3T", R.SCHEDULER, [], false)).toBe("ALLOW");
    expect(decide("場控", "配合銷假", [], false)).toBe("ALLOW");
  });
  it("does not grant an ongoing exception after another day was approved", () => {
    expect(decide("場控", R.SCHEDULER, [], false)).toBe("CONFIRM_SCHEDULER");
    expect(decide("場控", R.ASSIST, [R.SCHEDULER], false)).toBe("BLOCK");
  });
});
