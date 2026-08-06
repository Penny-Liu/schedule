import { describe, expect, it } from "vitest";
import { validateSyncPayload } from "./syncValidation";

describe("validateSyncPayload", () => {
  it("normalizes valid tasks and removes unknown fields", () => {
    expect(
      validateSyncPayload(
        JSON.stringify([
          {
            id: 1,
            selected: true,
            start: "2026-08-01",
            end: "2026-08-31",
            ignored: "value",
          },
        ]),
      ),
    ).toBe(
      JSON.stringify([
        { id: 1, selected: true, start: "2026-08-01", end: "2026-08-31" },
      ]),
    );
  });

  it("rejects malformed JSON and duplicate task ids", () => {
    expect(() => validateSyncPayload("not-json")).toThrow("valid JSON");
    expect(() =>
      validateSyncPayload(
        JSON.stringify([
          { id: 1, selected: true },
          { id: 1, selected: true },
        ]),
      ),
    ).toThrow("unique integers");
  });

  it("rejects invalid and excessive date ranges", () => {
    expect(() =>
      validateSyncPayload(
        JSON.stringify([{ id: 2, selected: true, start: "2026/01/01" }]),
      ),
    ).toThrow("YYYY-MM-DD");

    expect(() =>
      validateSyncPayload(
        JSON.stringify([
          { id: 2, selected: true, start: "2025-01-01", end: "2026-12-31" },
        ]),
      ),
    ).toThrow("cannot exceed");
  });

  it("requires at least one selected task", () => {
    expect(() =>
      validateSyncPayload(JSON.stringify([{ id: 1, selected: false }])),
    ).toThrow("At least one");
  });
});
