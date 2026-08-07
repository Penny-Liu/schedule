import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  finalizeExcelWorksheet,
  formatExcelScheduleLabel,
  getExcelColumnName,
  getExcelTextLineCount,
  initializeExcelWorkbook,
  styleExcelSubtitle,
  styleExcelTitle,
} from "../services/excelReportUtils.ts";

const outputDirectory = resolve("outputs/excel-export-design");
const outputPath = resolve(outputDirectory, "radiographer-schedule-design-preview.xlsx");
await mkdir(outputDirectory, { recursive: true });

const workbook = new ExcelJS.Workbook();
initializeExcelWorkbook(workbook, "放射師排班表匯出設計預覽");
const dates = Array.from({ length: 14 }, (_, index) => `${8}/${index + 1}\n(${["六", "日", "一", "二", "三", "四", "五"][index % 7]})`);

const prepareSheet = (name, title, subtitle, firstColumn, tabColor) => {
  const sheet = workbook.addWorksheet(name);
  const lastColumn = dates.length + 1;
  styleExcelTitle(sheet, title, lastColumn);
  sheet.getCell("A1").font = { name: "微軟正黑體", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  styleExcelSubtitle(sheet, subtitle, lastColumn);
  sheet.addRow([firstColumn, ...dates]);
  sheet.getRow(3).height = 34;
  sheet.columns = [{ width: 14 }, ...dates.map(() => ({ width: 9.5 }))];
  sheet.properties.tabColor = { argb: tabColor };
  return sheet;
};

const userSheet = prepareSheet(
  "人員視角",
  "影像醫學部－人員排班表（設計預覽）",
  "橘字＝特殊角色　｜　粉紅底＝週末／休診　｜　紅底＝配合銷假",
  "姓名",
  "FF0F4C81",
);
const people = [
  ["王小明", `${formatExcelScheduleLabel("技術支援")}\n開`, "CT", "休", "MR", "US", "CT", "休"],
  ["李小華", "MR", "休", "CT", "US\n晚", "CT", "MR", "休"],
  ["陳怡君", "US", "休", "MR", "CT", "US", "CT\n銷", "休"],
];
for (const person of people) {
  const row = userSheet.addRow([...person, ...person.slice(1)]);
  const maxLines = Math.max(...person.slice(1).map((value) => getExcelTextLineCount(value)));
  row.height = Math.min(64, Math.max(38, maxLines * 17 + 8));
  row.getCell(1).font = { name: "微軟正黑體", size: 12, bold: true, color: { argb: "FF17365D" } };
  row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2F8" } };
}
for (const column of [2, 3, 9, 10]) {
  userSheet.getCell(3, column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0F5" } };
  userSheet.getCell(3, column).font = { name: "微軟正黑體", bold: true, color: { argb: "FFDC2626" } };
}
finalizeExcelWorksheet(userSheet, {
  headerRows: [3], dataStartRow: 4, lastColumn: dates.length + 1, freezeRows: 3,
  alternatingRows: false, paperSize: 8, fitToHeight: 1, zoomScale: 75,
  printArea: `A1:${getExcelColumnName(dates.length + 1)}${userSheet.rowCount}`,
});

const stationSheet = prepareSheet(
  "崗位視角",
  "影像醫學部－崗位分配表（設計預覽）",
  "姓名置中排列　｜　橘字＝特殊角色　｜　粉紅底＝週末／休診",
  "崗位",
  "FF5B9BD5",
);
const stations = [
  ["CT", "王小明", "王小明", "李小華", "李小華", "陳怡君", "陳怡君", "王小明"],
  ["MR", "李小華", "", "陳怡君", "王小明", "李小華", "王小明", ""],
  ["US", "陳怡君", "", "王小明", "陳怡君\n(晚班)", "王小明", "李小華", ""],
];
for (const station of stations) {
  const row = stationSheet.addRow([...station, ...station.slice(1)]);
  row.height = 42;
  row.getCell(1).font = { name: "微軟正黑體", size: 12, bold: true, color: { argb: "FF17365D" } };
  row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
}
finalizeExcelWorksheet(stationSheet, {
  headerRows: [3], dataStartRow: 4, lastColumn: dates.length + 1, freezeRows: 3,
  alternatingRows: false, paperSize: 8, fitToHeight: 1, zoomScale: 75,
  printArea: `A1:${getExcelColumnName(dates.length + 1)}${stationSheet.rowCount}`,
});

await workbook.xlsx.writeFile(outputPath);

const verification = new ExcelJS.Workbook();
await verification.xlsx.readFile(outputPath);
for (const sheetName of ["人員視角", "崗位視角"]) {
  const sheet = verification.getWorksheet(sheetName);
  if (!sheet || sheet.views[0]?.ySplit !== 3 || sheet.pageSetup.fitToHeight !== 1) {
    throw new Error(`${sheetName} 的凍結窗格或單頁列印設定未保存`);
  }
}

console.log(outputPath);
