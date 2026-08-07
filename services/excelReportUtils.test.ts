import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  EXCEL_REPORT_COLORS,
  finalizeExcelWorksheet,
  formatExcelScheduleLabel,
  getExcelColumnName,
  getExcelTextLineCount,
  initializeExcelWorkbook,
  styleExcelSubtitle,
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

  it("supports a subtitle band and single-page A3 schedule printing", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("人員視角");
    styleExcelTitle(sheet, "人員排班表", 33);
    styleExcelSubtitle(sheet, "橘字＝特殊角色｜粉紅底＝週末／休診", 33);
    sheet.addRow(["姓名", ...Array.from({ length: 31 }, (_, index) => index + 1), "上班天數"]);
    sheet.addRow(["王小明"]);

    finalizeExcelWorksheet(sheet, {
      headerRows: [3],
      dataStartRow: 4,
      lastColumn: 33,
      freezeRows: 3,
      paperSize: 8,
      fitToHeight: 1,
      zoomScale: 75,
      printArea: "A1:AG4",
    });

    expect(sheet.getCell("A2").value).toBe("橘字＝特殊角色｜粉紅底＝週末／休診");
    expect(sheet.getCell("A2").isMerged).toBe(true);
    expect(sheet.views[0]).toMatchObject({ ySplit: 3, zoomScale: 75 });
    expect(sheet.pageSetup).toMatchObject({
      paperSize: 8,
      fitToHeight: 1,
      printArea: "A1:AG4",
      printTitlesRow: "1:3",
    });
    expect(getExcelColumnName(33)).toBe("AG");
  });

  it("wraps long schedule labels without splitting short modality codes", () => {
    expect(formatExcelScheduleLabel("技術支援")).toBe("技術\n支援");
    expect(formatExcelScheduleLabel("大直支援")).toBe("大直\n支援");
    expect(formatExcelScheduleLabel("MR1.5T")).toBe("MR1.5T");
    expect(formatExcelScheduleLabel("BMD/DX")).toBe("BMD/DX");
    expect(getExcelTextLineCount("技術\n支援\n開")).toBe(3);
  });
});
