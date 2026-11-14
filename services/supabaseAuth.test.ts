import { describe, expect, it } from "vitest";
import { UserRole } from "../types";
import { isProtectedEditorRole, requiresSupabaseLogin } from "./supabaseAuth";

describe("Supabase login and protected editor roles", () => {
  it("requires secure login for health management without granting radiographer editor rights", () => {
    for (const role of [UserRole.HM_SUPERVISOR, UserRole.HM_STAFF]) {
      expect(requiresSupabaseLogin(role)).toBe(true);
      expect(isProtectedEditorRole(role)).toBe(false);
    }
    for (const role of [UserRole.SUPERVISOR, UserRole.SYSTEM_ADMIN]) {
      expect(requiresSupabaseLogin(role)).toBe(true);
      expect(isProtectedEditorRole(role)).toBe(true);
    }
    for (const role of [UserRole.VIEWER, UserRole.RADIOGRAPHER_STAFF]) {
      expect(requiresSupabaseLogin(role)).toBe(false);
      expect(isProtectedEditorRole(role)).toBe(false);
    }
  });
});
