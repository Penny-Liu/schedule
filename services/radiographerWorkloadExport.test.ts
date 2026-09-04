import { describe, expect, it } from "vitest";
import {
  excludeRowsFromRankedSheets,
  getRadiographerAssistantNames,
  orderMonthlySummaryRows,
} from "./radiographerWorkloadExport";

const users = [
  { name: "一般甲", role: "RADIOGRAPHER_STAFF" },
  { name: "助理甲", role: "RADIOGRAPHER_ASSISTANT" },
  { name: "劉雅萍", role: "SYSTEM_ADMIN" },
  { name: "助理乙", role: "RADIOGRAPHER_ASSISTANT" },
];

describe("radiographer monthly workload export rows", () => {
  it("includes Liu Yaping in the summary and keeps assistants last", () => {
    const assistantNames = getRadiographerAssistantNames(users);
    const rows = [
      { name: "助理甲", value: 1 },
      { name: "一般甲", value: 2 },
      { name: "助理乙", value: 3 },
      { name: "劉雅萍", value: 4 },
    ];

    expect(
      orderMonthlySummaryRows(rows, assistantNames).map((row) => row.name),
    ).toEqual(["一般甲", "劉雅萍", "助理甲", "助理乙"]);
  });

  it("excludes Liu Yaping and assistants from ranked sheets", () => {
    const assistantNames = getRadiographerAssistantNames(users);
    expect(
      excludeRowsFromRankedSheets(
        users.map((user) => ({ name: user.name })),
        assistantNames,
      ).map((row) => row.name),
    ).toEqual(["一般甲"]);
  });
});
