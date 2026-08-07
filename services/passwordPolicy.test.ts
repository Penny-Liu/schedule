import { describe, expect, it } from "vitest";
import {
  DEFAULT_PASSWORD,
  PUBLIC_VIEWER_DEFAULT_PASSWORD,
  assertPasswordMigrationReady,
  getPasswordPolicyErrors,
  getPasswordPolicyErrorsForRole,
  getDefaultPasswordForRole,
  getPasswordTransitionForAccessUpdate,
  getTemporaryPasswordHint,
  isPasswordMigrationReady,
  isPasswordMigrationReadyForRole,
  isDefaultOrMissingPassword,
  passwordForSupabaseAuth,
} from "./passwordPolicy.mjs";

describe("password migration policy", () => {
  it("accepts a simple six-character password with letters and numbers", () => {
    expect(isPasswordMigrationReady("排班Safe2026")).toBe(true);
    expect(isPasswordMigrationReady("safe26")).toBe(true);
    expect(getPasswordPolicyErrors("排班Safe2026")).toEqual([]);
  });

  it("rejects short passwords before Auth migration", () => {
    expect(isPasswordMigrationReady("1234")).toBe(false);
    expect(getPasswordPolicyErrors("1234")[0]).toContain("6");
  });

  it("recognizes missing and default passwords that require an update", () => {
    expect(DEFAULT_PASSWORD).toBe("1234ab");
    expect(PUBLIC_VIEWER_DEFAULT_PASSWORD).toBe("1234");
    expect(getDefaultPasswordForRole("VIEWER")).toBe("1234");
    expect(getDefaultPasswordForRole("SYSTEM_ADMIN")).toBe("1234ab");
    expect(getTemporaryPasswordHint("1234", "SYSTEM_ADMIN")).toBe("1234");
    expect(getTemporaryPasswordHint(undefined, "SYSTEM_ADMIN")).toBe("1234ab");
    expect(getTemporaryPasswordHint("safe26", "SYSTEM_ADMIN")).toBeUndefined();
    expect(isDefaultOrMissingPassword(undefined, undefined)).toBe(true);
    expect(isDefaultOrMissingPassword("", undefined)).toBe(true);
    expect(isDefaultOrMissingPassword("1234", "VIEWER")).toBe(true);
    expect(isDefaultOrMissingPassword("1234", "SYSTEM_ADMIN")).toBe(true);
    expect(isDefaultOrMissingPassword("1234ab", "SYSTEM_ADMIN")).toBe(true);
    expect(isDefaultOrMissingPassword("safe26", "SYSTEM_ADMIN")).toBe(false);
  });

  it("replaces a legacy password when permissions are saved for a non-viewer", () => {
    expect(getPasswordTransitionForAccessUpdate("1234", "SYSTEM_ADMIN", true)).toEqual({
      temporaryPassword: "1234ab",
      updates: { password: "1234ab", mustChangePassword: true },
    });
    expect(getPasswordTransitionForAccessUpdate("safe26", "SYSTEM_ADMIN", true)).toEqual({
      temporaryPassword: undefined,
      updates: {},
    });
    expect(getPasswordTransitionForAccessUpdate("1234", "VIEWER", true)).toEqual({
      temporaryPassword: undefined,
      updates: {},
    });
  });

  it("rejects passwords without both text and a number", () => {
    expect(getPasswordPolicyErrors("abcdefgh")).toContain("密碼至少需要包含一個數字");
    expect(getPasswordPolicyErrors("24681357")).toContain("密碼至少需要包含一個英文字母或文字字元");
  });

  it("throws a user-facing error for invalid passwords", () => {
    expect(() => assertPasswordMigrationReady("password1")).toThrow("常見");
  });

  it("allows the announced public password only for VIEWER accounts", () => {
    expect(isPasswordMigrationReadyForRole(PUBLIC_VIEWER_DEFAULT_PASSWORD, "VIEWER")).toBe(true);
    expect(isPasswordMigrationReadyForRole(PUBLIC_VIEWER_DEFAULT_PASSWORD, "SYSTEM_ADMIN")).toBe(false);
    expect(isPasswordMigrationReadyForRole(DEFAULT_PASSWORD, "SYSTEM_ADMIN")).toBe(true);
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
