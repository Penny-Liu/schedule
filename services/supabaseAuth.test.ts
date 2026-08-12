import { describe, expect, it } from "vitest";
import { UserRole } from "../types";
import { isProtectedEditorRole } from "./supabaseAuth";

describe("protected Supabase editor roles", () => {
  it("requires Supabase Auth only for workload allocation editors", () => {
    expect(isProtectedEditorRole(UserRole.SUPERVISOR)).toBe(true);
    expect(isProtectedEditorRole(UserRole.SYSTEM_ADMIN)).toBe(true);
    expect(isProtectedEditorRole(UserRole.VIEWER)).toBe(false);
    expect(isProtectedEditorRole(UserRole.RADIOGRAPHER_STAFF)).toBe(false);
  });
});
