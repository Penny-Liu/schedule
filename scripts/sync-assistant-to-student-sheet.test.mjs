import { describe, expect, it } from "vitest";

import {
  buildSheetUpdatePlan,
  getDisplayName,
  normalizeSheetDate,
  removeManagedAssistantMarker,
  YINGPING_STUDENT_USER_ID,
} from "./sync-assistant-to-student-sheet.mjs";

describe("radiographer assistant to student sheet synchronization", () => {
  it("shows only the final two characters of a radiographer name", () => {
    expect(getDisplayName("江英平")).toBe("英平");
    expect(getDisplayName("歐陽雅")).toBe("陽雅");
    expect(getDisplayName("雅")).toBe("雅");
  });

  it("removes only the old managed marker and preserves human notes", () => {
    const original = "請提早到班\n【放射師助理：舊名】";
    expect(removeManagedAssistantMarker(original)).toBe("請提早到班");
    expect(removeManagedAssistantMarker("【放射師助理：英平】")).toBe("");
  });

  it("normalizes the date formats used by Google Sheets", () => {
    expect(normalizeSheetDate("2026-9-2")).toBe("2026-09-02");
    expect(normalizeSheetDate("2026/09/02")).toBe("2026-09-02");
    expect(normalizeSheetDate("09/02/2026")).toBe("");
  });

  it("writes Yingping to ConfirmedUserID and removes managed memo markers", () => {
    const rows = [
      ["Date", "Signups_JSON", "ConfirmedUserID", "IsClosed", "Note", "Memos_JSON", "工讀生備忘"],
      ["2026-09-01", "", "", "", "", "", "人工備忘"],
      ["2026/9/2", "", "", "", "", "", "【放射師助理：舊名】"],
    ];
    const assistantsByDate = new Map([
      ["2026-09-01", ["江英平"]],
      ["2026-09-02", []],
      ["2026-10-01", ["江英平"]],
    ]);

    expect(buildSheetUpdatePlan(rows, assistantsByDate)).toEqual({
      sheetDates: ["2026-09-01", "2026-09-02"],
      headerColumnCount: 7,
      preservedOtherConfirmedCount: 0,
      cellUpdates: [
        {
          rowNumber: 2,
          columnIndex: 2,
          date: "2026-09-01",
          value: YINGPING_STUDENT_USER_ID,
        },
        {
          rowNumber: 3,
          columnIndex: 6,
          date: "2026-09-02",
          value: "",
        },
      ],
      appendedRows: [
        {
          rowNumber: 4,
          date: "2026-10-01",
          values: [
            "2026-10-01",
            "",
            YINGPING_STUDENT_USER_ID,
            "",
            "",
            "",
            "",
          ],
        },
      ],
    });
  });

  it("preserves another confirmed student and still removes the old marker", () => {
    const rows = [
      ["Date", "Signups_JSON", "ConfirmedUserID", "IsClosed", "Note", "Memos_JSON", "工讀生備忘"],
      ["2026-09-09", "", "u_other", "", "", "", "【放射師助理：英平】"],
    ];
    const plan = buildSheetUpdatePlan(
      rows,
      new Map([["2026-09-09", ["江英平"]]]),
    );

    expect(plan.preservedOtherConfirmedCount).toBe(1);
    expect(plan.cellUpdates).toEqual([
      {
        rowNumber: 2,
        columnIndex: 6,
        date: "2026-09-09",
        value: "",
      },
    ]);
  });

  it("clears only Yingping when the radiographer assistant shift is removed", () => {
    const rows = [
      ["Date", "Signups_JSON", "ConfirmedUserID", "IsClosed", "Note", "Memos_JSON", "工讀生備忘"],
      ["2026-09-10", "", YINGPING_STUDENT_USER_ID, "", "", "", ""],
      ["2026-09-11", "", "u_other", "", "", "", ""],
    ];
    const plan = buildSheetUpdatePlan(rows, new Map());

    expect(plan.cellUpdates).toEqual([
      {
        rowNumber: 2,
        columnIndex: 2,
        date: "2026-09-10",
        value: "",
      },
    ]);
  });
});
