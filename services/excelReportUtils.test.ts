import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  EXCEL_REPORT_COLORS,
  finalizeExcelWorksheet,
  initializeExcelWorkbook,
  styleExcelTitle,
} from "./excelReportUtils";

describe("Excel report design helpers", () => {
  it("applies the shared title, frozen header, filter, print, and metadata", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("月報表");
    initializeExcelWorkbook(workbook, "放射師月報表");
    styleExcelTitle(sheet, "放射師月報表", 4);
    sheet.addRow(["姓名", "現場", "遠班", "總計"]);
    sheet.addRow(["王小明", 10, 2, 12]);
    sheet.addRow(["李小華", 8, 3, 11]);

    finalizeExcelWorksheet(sheet, {
      headerRows: [2],
      dataStartRow: 3,
      lastColumn: 4,
      autoFilter: true,
    });

    expect(workbook.creator).toBe("排班管理系統");
    expect(sheet.getCell("A1").fill).toMatchObject({
      fgColor: { argb: EXCEL_REPORT_COLORS.title },
    });
    expect(sheet.views[0]).toMatchObject({
      state: "frozen",
      xSplit: 1,
      ySplit: 2,
      showGridLines: false,
    });
    expect(sheet.autoFilter).toEqual({
      from: { row: 2, column: 1 },
      to: { row: 2, column: 4 },
    });
    expect(sheet.pageSetup).toMatchObject({
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      printTitlesRow: "1:2",
    });
    expect(sheet.getCell("A4").fill).toMatchObject({
      fgColor: { argb: EXCEL_REPORT_COLORS.alternate },
    });
  });

  it("keeps report-specific semantic fills", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("班表");
    styleExcelTitle(sheet, "班表", 2);
    sheet.addRow(["日期", "狀態"]);
    const data = sheet.addRow(["2026-08-01", "假日"]);
    data.getCell(2).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFE4E1" },
    };

    finalizeExcelWorksheet(sheet, {
      headerRows: [2],
      dataStartRow: 3,
      lastColumn: 2,
    });

    expect(data.getCell(2).fill).toMatchObject({
      fgColor: { argb: "FFFFE4E1" },
    });
  });
});
