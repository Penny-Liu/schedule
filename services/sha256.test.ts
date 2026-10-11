import { describe, expect, it } from "vitest";
import { sha256Hex, sha256HexFallback } from "./sha256.mjs";

describe("SHA-256 compatibility", () => {
  it("matches the standard SHA-256 vectors", async () => {
    expect(sha256HexFallback(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await sha256Hex("北投排班")).toBe(
      sha256HexFallback(new TextEncoder().encode("北投排班")),
    );
  });
});
