import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  EXCEL_REPORT_COLORS,
  finalizeExcelWorksheet,
  initializeExcelWorkbook,
  styleExcelTitle,
} from "../services/excelReportUtils.ts";

const outputDirectory = resolve("outputs/excel-export-design");
const outputPath = resolve(outputDirectory, "excel-export-theme-preview.xlsx");
await mkdir(outputDirectory, { recursive: true });

const workbook = new ExcelJS.Workbook();
initializeExcelWorkbook(workbook, "Excel 匯出版面預覽");
const sheet = workbook.addWorksheet("月報表預覽");
sheet.columns = [
  { width: 16 },
  { width: 12 },
  { width: 12 },
  { width: 12 },
  { width: 14 },
];

styleExcelTitle(sheet, "放射師工作量月報表｜共同匯出設計預覽", 5);
sheet.addRow(["姓名", "上班天數", "現場工作量", "遠班工作量", "總加權"]);
const header = sheet.getRow(2);
[EXCEL_REPORT_COLORS.green, EXCEL_REPORT_COLORS.green, EXCEL_REPORT_COLORS.yellow, EXCEL_REPORT_COLORS.blue, EXCEL_REPORT_COLORS.orange]
  .forEach((color, index) => {
    header.getCell(index + 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: color },
    };
  });

sheet.addRow(["王小明", 20, 128.5, 36, 164.5]);
sheet.addRow(["李小華", 18, 116, 42.5, 158.5]);
sheet.addRow(["陳怡君", 21, 134, 28, 162]);
for (let row = 3; row <= 5; row += 1) {
  for (let column = 2; column <= 5; column += 1) {
    sheet.getCell(row, column).numFmt = "#,##0.0";
  }
  sheet.getRow(row).height = 24;
}

finalizeExcelWorksheet(sheet, {
  headerRows: [2],
  dataStartRow: 3,
  lastColumn: 5,
  autoFilter: true,
});

await workbook.xlsx.writeFile(outputPath);

const verification = new ExcelJS.Workbook();
await verification.xlsx.readFile(outputPath);
const verifiedSheet = verification.getWorksheet("月報表預覽");
if (!verifiedSheet || verifiedSheet.getCell("A1").value !== "放射師工作量月報表｜共同匯出設計預覽") {
  throw new Error("Excel 預覽檔驗證失敗");
}
if (verifiedSheet.views[0]?.state !== "frozen" || !verifiedSheet.autoFilter) {
  throw new Error("Excel 凍結窗格或篩選設定未保存");
}

console.log(outputPath);
