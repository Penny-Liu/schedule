const fs = require("fs");

let content = fs.readFileSync(
  "/Users/liuyaping/Downloads/schedule/pages/RadiographerWorkloadPage.tsx",
  "utf-8",
);

// 1. Add filter logic at the start of handleExport
content = content.replace(
  '  const handleExport = async () => {\n    try {\n      const workbook = new ExcelJS.Workbook();\n      const worksheet = workbook.addWorksheet("工作量統計");',
  `  const handleExport = async () => {\n    try {\n      const workbook = new ExcelJS.Workbook();\n      const worksheet = workbook.addWorksheet("工作量統計");\n\n      const assistants = radiographers\n        .filter(r => r.role === 'RADIOGRAPHER_ASSISTANT')\n        .map(r => r.name);\n      const excludedNames = ['劉雅萍', ...assistants];\n      const filteredWorkloadData = workloadData.filter(r => !excludedNames.includes(r.name));\n      const filteredDisplayData = displayData.filter(r => !excludedNames.includes(r.name));`,
);

// 2. Replace workloadData.forEach with filteredWorkloadData.forEach
content = content.replace(
  "      // 資料列\n      workloadData.forEach((row) => {",
  "      // 資料列\n      filteredWorkloadData.forEach((row) => {",
);

// 3. Replace displayData.forEach with filteredDisplayData.forEach
content = content.replace(
  "      displayData.forEach(row => {",
  "      filteredDisplayData.forEach(row => {",
);

// 4. Update Worksheet 3 header for 場控天數
content = content.replace(
  'const titleRow = worksheet3.addRow([title, "", "", "", "", "", "", "", "", "", ""]);',
  'const titleRow = worksheet3.addRow([title, "", "", "", "", "", "", "", "", "", "", ""]);',
);
content = content.replace(
  "worksheet3.mergeCells(titleRow.number, 1, titleRow.number, 11);",
  "worksheet3.mergeCells(titleRow.number, 1, titleRow.number, 12);",
);
content = content.replace(
  "const colHeaderRow = worksheet3.addRow(['姓名', '上班天數', '現場單位', 'MR', 'US', 'CT+CTA', 'CTA後處理', 'BMD+DX+MG', '遠班單位', '總單位', '教學與學習']);",
  "const colHeaderRow = worksheet3.addRow(['姓名', '上班天數', '現場單位', '場控天數', 'MR', 'US', 'CT+CTA', 'CTA後處理', 'BMD+DX+MG', '遠班單位', '總單位', '教學與學習']);",
);
content = content.replace(
  "for (let i = 3; i <= 8; i++) {",
  "for (let i = 3; i <= 9; i++) {",
);
content = content.replace(
  "colHeaderRow.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };\n        colHeaderRow.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };",
  "colHeaderRow.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };\n        colHeaderRow.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };",
);

// Update data row in worksheet 3
content = content.replace(
  "          const dataRow = worksheet3.addRow([\n            row.name,\n            row.workDays || 0,\n            onsite,\n            mrTotal,",
  "          const dataRow = worksheet3.addRow([\n            row.name,\n            row.workDays || 0,\n            onsite,\n            row.floorControl || 0,\n            mrTotal,",
);

// Update worksheet 3 columns
content = content.replace(
  "      worksheet3.columns = [\n        { width: 12 }, // 姓名\n        { width: 10 }, // 上班天數\n        { width: 10 }, // 現場單位\n        { width: 10 }, // MR",
  "      worksheet3.columns = [\n        { width: 12 }, // 姓名\n        { width: 10 }, // 上班天數\n        { width: 10 }, // 現場單位\n        { width: 10 }, // 場控天數\n        { width: 10 }, // MR",
);

// 5. Add Worksheet 4
const worksheet4Logic = `
      // --- 第四個工作表：個人專屬表單 (劉雅萍) ---
      const liuyapingData = workloadData.find(r => r.name === '劉雅萍');
      if (liuyapingData) {
        const worksheet4 = workbook.addWorksheet("劉雅萍");
        worksheet4.columns = [{ width: 80 }];

        const totalDays = liuyapingData.workDays || 0;
        const remoteDays = liuyapingData.remoteDays || 0;
        const nonRemoteDays = totalDays - remoteDays;
        
        // 抓出個人資料，如果無則用範本數值當預設值 (預防 undefined)
        const reportTyping = liuyapingData.reportTyping || 0;
        const proofreader = liuyapingData.proofreader || 0;
        const tsmcReport = liuyapingData.tsmcReport || 0;

        const contentRows = [
          "劉雅萍",
          "127000",
          "",
          \`\${y}年第\${m}週期\`,
          \`遠距 \${remoteDays}天 遠時數 \${remoteDays * 8}\`,
          \`總天 \${totalDays}天 總時數 \${totalDays * 8}\`,
          "",
          \`非遠距 \${nonRemoteDays}天 時數 \${nonRemoteDays * 8}\`,
          "",
          "【影像報告】",
          \`• 報告登打：\${reportTyping} 份\`,
          \`• 校對影像：\${proofreader} 份\`,
          \`• 台積電登打校對：\${tsmcReport}\`,
          "",
          "【專案推動】",
          "• 一森專案：排程、流程優化、月報彙整、ARIA手寫單",
          "• 智慧醫療合作（醫師 / 報告組 / 放射）",
          ">>遠健(遠距報告)、一森專案、報告系統優化",
          ">>大直超音波初步登打及校對",
          ">>台積電報告登打及校對",
          ">>一森檢查前SOAP確認",
          ">>一森報告校對",
          ">>影像醫學部排班系統+全院排班系統(含醫師、基因、大直健管)",
          ">>Vibe coding：排班系統/報告登打片語庫",
          "",
          "【人員管理與行政支援】",
          "放射科部門科務管理",
          "• 放射師人員成長儀表版(技能/配合度/公事務參與/潛能)",
          "• 放射師整月工作量單位u 統計(現場/遠班/總)",
          "• 放射師每日工作量",
          "• 放射師每週期崗位安排",
          "• 協助工讀生排班與任務分配",
          "• 處理衛材耗材清點與請購",
          "• Neupid 系統放射數據統計與月報統整",
          "• 放射師評核、受訓安排、人力搜尋、招募",
          "• 光碟燒錄流程優化",
          "• 膠片配章管理",
          "• 科會安排",
          "",
          "【職責內容總覽】",
          "• 遠健公司：與醫師工作、智慧醫療數據、AI工具",
          "• 現場流程(協助支援北投／大直現場作業)、人力招募與環境優化",
          "• 培育放射師多專才、提供臨床技術指導",
          "• 儀器保養維護管理",
          "• 協助醫師報告、影像校對、現場崗位支援",
          "• 影像相關資訊系統/硬體問題排除"
        ];

        contentRows.forEach((text, index) => {
          const row = worksheet4.addRow([text]);
          const cell = row.getCell(1);
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          cell.font = { name: '微軟正黑體', size: 12 };

          // 針對標題或特定項目做粗體與顏色
          if (index === 0) {
            cell.font = { name: '微軟正黑體', size: 16, bold: true };
          } else if (text.startsWith('【')) {
            cell.font = { name: '微軟正黑體', size: 14, bold: true, color: { argb: 'FF0052CC' } };
            row.height = 30;
          } else if (text.startsWith('劉雅萍') || text === '127000') {
            cell.font = { name: '微軟正黑體', size: 14, bold: true };
          } else if (text.includes('週期') || text.includes('遠距') || text.includes('總天')) {
            cell.font = { name: '微軟正黑體', size: 12, bold: true, color: { argb: 'FF333333' } };
          }
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
`;

content = content.replace(
  "      const buffer = await workbook.xlsx.writeBuffer();",
  worksheet4Logic,
);

fs.writeFileSync(
  "/Users/liuyaping/Downloads/schedule/pages/RadiographerWorkloadPage.tsx",
  content,
);
console.log("Update successful");
