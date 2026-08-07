import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  finalizeExcelWorksheet,
  getExcelColumnName,
  initializeExcelWorkbook,
  styleExcelSubtitle,
  styleExcelTitle,
} from "../services/excelReportUtils.ts";

const outputDirectory = resolve("outputs/physician-schedule-design");
const outputPath = resolve(outputDirectory, "physician-schedule-design-preview.xlsx");
await mkdir(outputDirectory, { recursive: true });

const workbook = new ExcelJS.Workbook();
initializeExcelWorkbook(workbook, "醫師排班表匯出設計預覽");
const dates = Array.from({ length: 14 }, (_, index) => `${8}/${index + 1}\n${["六", "日", "一", "二", "三", "四", "五"][index % 7]}`);
const lastColumn = dates.length + 1;
const border = {
  top: { style: "thin", color: { argb: "FFD6DEE8" } },
  left: { style: "thin", color: { argb: "FFD6DEE8" } },
  bottom: { style: "thin", color: { argb: "FFD6DEE8" } },
  right: { style: "thin", color: { argb: "FFD6DEE8" } },
};

const createSheet = (name, subtitle, tabColor) => {
  const sheet = workbook.addWorksheet(name);
  styleExcelTitle(sheet, "醫師排班表 2026-08-01 ~ 2026-08-14", lastColumn);
  sheet.getCell("A1").font = { name: "微軟正黑體", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  styleExcelSubtitle(sheet, subtitle, lastColumn);
  sheet.addRow(["項目／日期", ...dates]);
  sheet.getRow(3).height = 38;
  sheet.columns = [{ width: 15 }, ...dates.map(() => ({ width: 8.5 }))];
  sheet.properties.tabColor = { argb: tabColor };
  return sheet;
};

const decorate = (sheet) => {
  for (const column of [2, 3, 9, 10]) {
    sheet.getCell(3, column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0F5" } };
    sheet.getCell(3, column).font = { name: "微軟正黑體", bold: true, color: { argb: "FFDC2626" } };
  }
  for (let rowNumber = 4; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (row.getCell(2).isMerged) {
      row.height = 28;
      continue;
    }
    row.height = 66;
    const firstCell = row.getCell(1);
    if (firstCell.fill?.type !== "pattern") {
      firstCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2F8" } };
      firstCell.font = { name: "微軟正黑體", size: 11, bold: true, color: { argb: "FF17365D" } };
    }
  }
  finalizeExcelWorksheet(sheet, {
    headerRows: [3], dataStartRow: 4, lastColumn, freezeRows: 3,
    alternatingRows: false, paperSize: 8, fitToHeight: 1, zoomScale: 75,
    printArea: `A1:${getExcelColumnName(lastColumn)}${sheet.rowCount}`,
  });
};

const stationSheet = createSheet(
  "崗位視角",
  "依院區與崗位排列　｜　內容順序：姓名、時段、任務　｜　橘字＝模擬排班",
  "FF0F4C81",
);
stationSheet.mergeCells(4, 1, 4, lastColumn);
stationSheet.getCell("A4").value = "北投";
stationSheet.getCell("A4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3B82F6" } };
stationSheet.getCell("A4").font = { name: "微軟正黑體", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
stationSheet.getCell("A4").alignment = { horizontal: "center", vertical: "middle" };
for (const [label, values] of [
  ["影像", ["王醫師\n8-16\n(影像判讀)", "李醫師\n8'-17'", "陳醫師\n9-18"]],
  ["GI", ["李醫師\n8-12", "", "王醫師\n13-17\n(支援)"]],
  ["行政", ["陳醫師", "王醫師", ""]],
]) {
  const row = stationSheet.addRow([label, ...Array.from({ length: 14 }, (_, index) => values[index % values.length])]);
  row.eachCell((cell) => {
    cell.border = border;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
}
decorate(stationSheet);

const personnelSheet = createSheet(
  "人員視角",
  "藍底＝北投　｜　棕底＝大直　｜　黃底＝台中　｜　紅字＝晚班　｜　灰底／X＝休假或不排班",
  "FF5B9BD5",
);
for (const [name, values] of [
  ["王醫師", [
    { station: "影像", location: "北投", time: "8-16", task: "晚班" },
    "X",
    { station: "GI", location: "大直", time: "8'-17'", task: "支援" },
  ]],
  ["李醫師", [
    { station: "GI", location: "北投", time: "8-12", task: "" },
    { station: "影像", location: "台中", time: "13-17", task: "晚班" },
    "X",
  ]],
  ["陳醫師", [
    { station: "行政", location: "北投", time: "8-16", task: "" },
    "X",
    { station: "影像", location: "台中", time: "9-18", task: "" },
  ]],
]) {
  const row = personnelSheet.addRow([name]);
  Array.from({ length: 14 }, (_, index) => values[index % values.length]).forEach((value, index) => {
    const cell = row.getCell(index + 2);
    if (value === "X") {
      cell.value = "X";
      cell.font = { name: "微軟正黑體", color: { argb: "FF9CA3AF" } };
      return;
    }
    const richText = [
      { text: `${value.station}\n`, font: { name: "微軟正黑體", size: 14, bold: true } },
      { text: `${value.location}\n`, font: { name: "微軟正黑體", size: 9 } },
      { text: value.task ? `${value.time}\n` : value.time, font: { name: "微軟正黑體", size: 9 } },
    ];
    if (value.task) {
      richText.push({
        text: value.task,
        font: {
          name: "微軟正黑體",
          size: 9,
          bold: value.task === "晚班",
          color: { argb: value.task === "晚班" ? "FFDC0000" : "FF0050C8" },
        },
      });
    }
    cell.value = { richText };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: { 北投: "FFDCEBFF", 大直: "FFF0DCC8", 台中: "FFFFF8BA" }[value.location] },
    };
  });
  row.eachCell((cell) => {
    cell.border = border;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
}
decorate(personnelSheet);

await workbook.xlsx.writeFile(outputPath);
const verification = new ExcelJS.Workbook();
await verification.xlsx.readFile(outputPath);
for (const sheetName of ["崗位視角", "人員視角"]) {
  const sheet = verification.getWorksheet(sheetName);
  if (!sheet || sheet.views[0]?.ySplit !== 3 || sheet.pageSetup.fitToHeight !== 1) {
    throw new Error(`${sheetName} 的凍結窗格或單頁列印設定未保存`);
  }
}
const verifiedPersonnel = verification.getWorksheet("人員視角");
if (
  verifiedPersonnel.getCell("B4").fill?.fgColor?.argb !== "FFDCEBFF" ||
  verifiedPersonnel.getCell("D4").fill?.fgColor?.argb !== "FFF0DCC8" ||
  !verifiedPersonnel.getCell("B4").value.richText.some(
    (part) => part.text === "晚班" && part.font?.color?.argb === "FFDC0000",
  )
) {
  throw new Error("人員視角的院區底色或晚班紅字未正確保存");
}

console.log(outputPath);
