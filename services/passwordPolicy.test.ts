import { describe, expect, it } from "vitest";
import {
  assertPasswordMigrationReady,
  getPasswordPolicyErrors,
  getPasswordPolicyErrorsForRole,
  isPasswordMigrationReady,
  isPasswordMigrationReadyForRole,
  passwordForSupabaseAuth,
} from "./passwordPolicy.mjs";

describe("password migration policy", () => {
  it("accepts a password with at least eight characters, letters, and numbers", () => {
    expect(isPasswordMigrationReady("排班Safe2026")).toBe(true);
    expect(getPasswordPolicyErrors("排班Safe2026")).toEqual([]);
  });

  it("rejects short passwords before Auth migration", () => {
    expect(isPasswordMigrationReady("1234")).toBe(false);
    expect(getPasswordPolicyErrors("1234")[0]).toContain("8");
  });

  it("rejects passwords without both text and a number", () => {
    expect(getPasswordPolicyErrors("abcdefgh")).toContain("密碼至少需要包含一個數字");
    expect(getPasswordPolicyErrors("24681357")).toContain("密碼至少需要包含一個英文字母或文字字元");
  });

  it("throws a user-facing error for invalid passwords", () => {
    expect(() => assertPasswordMigrationReady("password1")).toThrow("常見");
  });

  it("allows the announced public password only for VIEWER accounts", () => {
    expect(isPasswordMigrationReadyForRole("12345", "VIEWER")).toBe(true);
    expect(isPasswordMigrationReadyForRole("12345", "SYSTEM_ADMIN")).toBe(false);
    expect(getPasswordPolicyErrorsForRole("123", "VIEWER")[0]).toContain("4");
  });

  it("derives an Auth-compatible password only for the public VIEWER", async () => {
    const derived = await passwordForSupabaseAuth("12345", "VIEWER");
    expect(derived).toMatch(/^v_[a-f0-9]{64}$/);
    expect(derived).toBe(await passwordForSupabaseAuth("12345", "VIEWER"));
    expect(await passwordForSupabaseAuth("StaffSafe2026", "SYSTEM_ADMIN")).toBe("StaffSafe2026");
  });
});
