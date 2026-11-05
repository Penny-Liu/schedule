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

  it("allows the equipment monthly summary task", () => {
    expect(
      validateSyncPayload(JSON.stringify([{ id: 4, selected: true }])),
    ).toBe(JSON.stringify([{ id: 4, selected: true }]));
  });
});

it('accepts duration as the fifth task and rejects unknown task ids', () => {
 const payload=JSON.stringify([1,2,3,4,5].map(id=>({id,selected:true})));
 expect(JSON.parse(validateSyncPayload(payload))).toHaveLength(5);
 expect(()=>validateSyncPayload('[{"id":6,"selected":true}]')).toThrow('between 1 and 5');
});
it('validates real dates and paired duration dates',()=>{
 expect(()=>validateSyncPayload('[{"id":5,"selected":true,"start":"2026-02-30","end":"2026-03-02"}]')).toThrow('valid date');
 expect(()=>validateSyncPayload('[{"id":5,"selected":true,"end":"2026-11-05"}]')).toThrow('both start and end');
});
