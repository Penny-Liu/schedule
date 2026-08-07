const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const EXCEL_REPORT_COLORS = {
  title: "FF0F4C81",
  titleText: "FFFFFFFF",
  header: "FFDDEBF7",
  headerText: "FF1E3A5F",
  green: "FFE2EFDA",
  yellow: "FFFFF2CC",
  blue: "FFDDEBF7",
  orange: "FFFCE4D6",
  alternate: "FFF8FAFC",
  border: "FFD6DEE8",
  strongBorder: "FF94A3B8",
} as const;

type FinalizeWorksheetOptions = {
  titleRow?: number;
  headerRows?: number[];
  dataStartRow?: number;
  lastColumn?: number;
  freezeRows?: number;
  freezeColumns?: number;
  autoFilter?: boolean;
  landscape?: boolean;
  alternatingRows?: boolean;
  preserveFills?: boolean;
  printTitleRows?: string;
  fitToHeight?: number;
  paperSize?: number;
  zoomScale?: number;
  printArea?: string;
};

const thinBorder = {
  top: { style: "thin", color: { argb: EXCEL_REPORT_COLORS.border } },
  left: { style: "thin", color: { argb: EXCEL_REPORT_COLORS.border } },
  bottom: { style: "thin", color: { argb: EXCEL_REPORT_COLORS.border } },
  right: { style: "thin", color: { argb: EXCEL_REPORT_COLORS.border } },
};

const hasSolidFill = (cell: any) =>
  cell.fill?.type === "pattern" && cell.fill?.pattern === "solid";

export const getExcelColumnName = (columnNumber: number) => {
  let value = columnNumber;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
};

const getExcelTextVisualWidth = (value: string) =>
  Array.from(value).reduce(
    (width, character) => width + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1),
    0,
  );

/**
 * 將超過日期欄可讀寬度的崗位名稱分成兩行。
 * 中文以兩個半形字寬計算，避免只靠 Excel 自動換行而切掉最後一字。
 */
export const formatExcelScheduleLabel = (value: string, maxVisualWidth = 7) => {
  if (!value || value.includes("\n") || getExcelTextVisualWidth(value) <= maxVisualWidth) {
    return value;
  }

  const characters = Array.from(value);
  const targetWidth = Math.ceil(getExcelTextVisualWidth(value) / 2);
  let currentWidth = 0;
  let splitIndex = 1;

  for (let index = 0; index < characters.length - 1; index += 1) {
    currentWidth += /[^\u0000-\u00ff]/.test(characters[index]) ? 2 : 1;
    splitIndex = index + 1;
    if (currentWidth >= targetWidth) break;
  }

  return `${characters.slice(0, splitIndex).join("")}\n${characters.slice(splitIndex).join("")}`;
};

export const getExcelTextLineCount = (value: string) =>
  Math.max(1, value.split("\n").length);

export const initializeExcelWorkbook = (workbook: any, subject: string) => {
  const now = new Date();
  workbook.creator = "排班管理系統";
  workbook.lastModifiedBy = "排班管理系統";
  workbook.created = now;
  workbook.modified = now;
  workbook.subject = subject;
  workbook.company = "影像醫學部";
};

export const styleExcelTitle = (
  worksheet: any,
  title: string,
  lastColumn: number,
  rowNumber = 1,
) => {
  if (lastColumn > 1 && !worksheet.getCell(rowNumber, lastColumn).isMerged) {
    worksheet.mergeCells(rowNumber, 1, rowNumber, lastColumn);
  }
  const row = worksheet.getRow(rowNumber);
  const cell = row.getCell(1);
  cell.value = title;
  cell.font = {
    name: "微軟正黑體",
    size: 16,
    bold: true,
    color: { argb: EXCEL_REPORT_COLORS.titleText },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: EXCEL_REPORT_COLORS.title },
  };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  row.height = 34;
  return row;
};

export const styleExcelSubtitle = (
  worksheet: any,
  subtitle: string,
  lastColumn: number,
  rowNumber = 2,
) => {
  if (lastColumn > 1 && !worksheet.getCell(rowNumber, lastColumn).isMerged) {
    worksheet.mergeCells(rowNumber, 1, rowNumber, lastColumn);
  }
  const row = worksheet.getRow(rowNumber);
  const cell = row.getCell(1);
  cell.value = subtitle;
  cell.font = {
    name: "微軟正黑體",
    size: 10,
    color: { argb: "FF475569" },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEAF2F8" },
  };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  row.height = 24;
  return row;
};

export const finalizeExcelWorksheet = (
  worksheet: any,
  options: FinalizeWorksheetOptions = {},
) => {
  const {
    titleRow = 1,
    headerRows = [2],
    dataStartRow = Math.max(...headerRows, titleRow) + 1,
    lastColumn = worksheet.columnCount,
    freezeRows = Math.max(...headerRows, titleRow),
    freezeColumns = 1,
    autoFilter = false,
    landscape = lastColumn > 8,
    alternatingRows = true,
    preserveFills = true,
    printTitleRows = `1:${freezeRows}`,
    fitToHeight = 0,
    paperSize = 9,
    zoomScale = 85,
    printArea,
  } = options;

  const finalRow = worksheet.rowCount;
  const headerSet = new Set(headerRows);

  for (let rowNumber = 1; rowNumber <= finalRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let columnNumber = 1; columnNumber <= lastColumn; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      cell.font = { name: "微軟正黑體", size: 10, ...cell.font };

      if (rowNumber === titleRow) continue;

      if (headerSet.has(rowNumber)) {
        if (!preserveFills || !hasSolidFill(cell)) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: EXCEL_REPORT_COLORS.header },
          };
        }
        cell.font = {
          name: "微軟正黑體",
          size: 10,
          bold: true,
          color: cell.font?.color || { argb: EXCEL_REPORT_COLORS.headerText },
        };
        cell.alignment = {
          horizontal: "center",
          vertical: "middle",
          wrapText: true,
          ...cell.alignment,
        };
        cell.border = thinBorder;
      } else if (rowNumber >= dataStartRow) {
        if (
          alternatingRows &&
          (rowNumber - dataStartRow) % 2 === 1 &&
          (!preserveFills || !hasSolidFill(cell))
        ) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: EXCEL_REPORT_COLORS.alternate },
          };
        }
        cell.border = { ...thinBorder, ...cell.border };
        cell.alignment = {
          vertical: "middle",
          wrapText: true,
          horizontal: columnNumber === 1 ? "left" : "center",
          ...cell.alignment,
        };
      }
    }
  }

  worksheet.views = [
    {
      state: "frozen",
      xSplit: freezeColumns,
      ySplit: freezeRows,
      showGridLines: false,
      zoomScale,
    },
  ];
  worksheet.pageSetup = {
    ...worksheet.pageSetup,
    paperSize,
    orientation: landscape ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight,
    horizontalCentered: true,
    printTitlesRow: printTitleRows,
    ...(printArea ? { printArea } : {}),
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
      ...worksheet.pageSetup?.margins,
    },
  };
  worksheet.headerFooter = {
    ...worksheet.headerFooter,
    oddFooter: "&L匯出日期：&D&C第 &P / &N 頁&R排班管理系統",
  };

  if (autoFilter && headerRows.length === 1 && lastColumn > 0) {
    const headerRow = headerRows[0];
    worksheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: lastColumn },
    };
  }
};

export const downloadExcelBuffer = (buffer: any, filename: string) => {
  const blob = new Blob([buffer], { type: MIME_XLSX });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
