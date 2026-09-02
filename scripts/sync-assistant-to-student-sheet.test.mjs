import { describe, expect, it } from "vitest";

import {
  buildMemoUpdates,
  formatManagedAssistantMarker,
  getDisplayName,
  mergeManagedAssistantMemo,
  normalizeSheetDate,
  removeManagedAssistantMarker,
} from "./sync-assistant-to-student-sheet.mjs";

describe("radiographer assistant to student sheet synchronization", () => {
  it("shows only the final two characters of a radiographer name", () => {
    expect(getDisplayName("江英平")).toBe("英平");
    expect(getDisplayName("歐陽雅")).toBe("陽雅");
    expect(getDisplayName("雅")).toBe("雅");
  });

  it("formats multiple assistants without duplicates", () => {
    expect(formatManagedAssistantMarker(["江英平", "陳庭榕", "江英平"])).toBe(
      "【放射師助理：英平、庭榕】",
    );
  });

  it("preserves human notes while replacing or removing the managed marker", () => {
    const original = "請提早到班\n【放射師助理：舊名】";
    expect(mergeManagedAssistantMemo(original, ["江英平"])).toBe(
      "請提早到班\n【放射師助理：英平】",
    );
    expect(mergeManagedAssistantMemo(original, [])).toBe("請提早到班");
    expect(removeManagedAssistantMarker("【放射師助理：英平】")).toBe("");
  });

  it("normalizes the date formats used by Google Sheets", () => {
    expect(normalizeSheetDate("2026-9-2")).toBe("2026-09-02");
    expect(normalizeSheetDate("2026/09/02")).toBe("2026-09-02");
    expect(normalizeSheetDate("09/02/2026")).toBe("");
  });

  it("updates only the managed memo cells matched by date", () => {
    const rows = [
      ["Date", "Signups_JSON", "ConfirmedUserID", "IsClosed", "Note", "Memos_JSON", "工讀生備忘"],
      ["2026-09-01", "", "", "", "", "", "人工備忘"],
      ["2026/9/2", "", "", "", "", "", "【放射師助理：舊名】"],
    ];
    const assistantsByDate = new Map([
      ["2026-09-01", ["江英平"]],
      ["2026-09-02", []],
    ]);

    expect(buildMemoUpdates(rows, assistantsByDate)).toEqual({
      sheetDates: ["2026-09-01", "2026-09-02"],
      updates: [
        {
          rowNumber: 2,
          columnIndex: 6,
          date: "2026-09-01",
          value: "人工備忘\n【放射師助理：英平】",
        },
        {
          rowNumber: 3,
          columnIndex: 6,
          date: "2026-09-02",
          value: "",
        },
      ],
    });
  });
});
