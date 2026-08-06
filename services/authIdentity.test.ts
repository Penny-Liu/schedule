import { describe, expect, it } from "vitest";
import {
  findAuthUsernameCollisions,
  normalizeAuthEmailDomain,
  normalizeAuthUsername,
  usernameToAuthEmail,
} from "./authIdentity.mjs";

describe("Auth username identity mapping", () => {
  it("normalizes whitespace, case, and Unicode width", () => {
    expect(normalizeAuthUsername("  ＡＤＭＩＮ  ")).toBe("admin");
  });

  it("creates a stable internal email without exposing the username", async () => {
    const first = await usernameToAuthEmail("Penny", "AUTH.HOSPITAL.TW");
    const second = await usernameToAuthEmail(" penny ", "auth.hospital.tw");

    expect(first).toBe(second);
    expect(first).toMatch(/^u_[a-f0-9]{60}@auth\.hospital\.tw$/);
    expect(first).not.toContain("penny");
  });

  it("rejects fake, reserved, and malformed domains", () => {
    expect(() => normalizeAuthEmailDomain("accounts.invalid")).toThrow("真實網域");
    expect(() => normalizeAuthEmailDomain("example.com")).toThrow("真實網域");
    expect(() => normalizeAuthEmailDomain("https://hospital.tw")).toThrow("格式無效");
  });

  it("detects usernames that collapse to the same Auth identity", () => {
    expect(findAuthUsernameCollisions(["Admin", " admin ", "nurse"])).toEqual([
      { canonicalUsername: "admin", usernames: ["Admin", " admin "] },
    ]);
  });
});
