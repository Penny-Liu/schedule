import { describe, expect, it } from "vitest";
import {
  DEFAULT_RADIOGRAPHER_MONTHLY_REPORT_SECTIONS,
  formatRadiographerMonthlyReportItem,
  formatRadiographerMonthlyReportSectionTitle,
  normalizeRadiographerMonthlyReportSections,
} from "./radiographerMonthlyReport";

describe("radiographer monthly narrative report", () => {
  it("provides the three default configurable sections", () => {
    expect(DEFAULT_RADIOGRAPHER_MONTHLY_REPORT_SECTIONS.map((s) => s.title)).toEqual([
      "專案推動",
      "人員管理與行政支援",
      "職責內容總覽",
    ]);
  });

  it("formats item types without requiring users to enter markers", () => {
    expect(formatRadiographerMonthlyReportItem({ id: "1", kind: "bullet", text: "項目" })).toEqual({ text: "• 項目", isIndented: false });
    expect(formatRadiographerMonthlyReportItem({ id: "2", kind: "nestedBullet", text: "縮排" })).toEqual({ text: "• 縮排", isIndented: true });
    expect(formatRadiographerMonthlyReportItem({ id: "3", kind: "detail", text: "明細" })).toEqual({ text: ">> 明細", isIndented: true });
    expect(formatRadiographerMonthlyReportItem({ id: "4", kind: "heading", text: "小標題" })).toEqual({ text: "小標題", isIndented: false });
    expect(formatRadiographerMonthlyReportItem({ id: "5", kind: "bullet", text: "   " })).toEqual({ text: "", isIndented: false });
  });

  it("normalizes stored settings and keeps an intentionally empty section list", () => {
    expect(normalizeRadiographerMonthlyReportSections([])).toEqual([]);
    expect(normalizeRadiographerMonthlyReportSections(null)).toHaveLength(3);
    expect(formatRadiographerMonthlyReportSectionTitle("【專案推動】")).toBe("【專案推動】");
  });
});
