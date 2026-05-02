import * as xlsx from 'xlsx';
import fs from 'fs';

const filePath = '/Users/liuyaping/Downloads/schedule/影像醫學部2026第05週期工作報表.xlsx';
if (fs.existsSync(filePath)) {
  const data = fs.readFileSync(filePath);
  const workbook = xlsx.read(data, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log('--- Excel 結構 ---');
  rows.slice(0, 15).forEach((row, i) => {
    console.log(`行 ${i + 1}:`, row);
  });
} else {
  console.log("找不到檔案:", filePath);
}
