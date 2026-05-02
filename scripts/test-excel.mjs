import * as xlsx from 'xlsx';
import fs from 'fs';

const dir = '.';
const files = fs.readdirSync(dir)
  .filter(f => f.startsWith('report') && (f.endsWith('.xls') || f.endsWith('.xlsx')))
  .map(f => ({ name: f, time: fs.statSync(`${dir}/${f}`).mtime.getTime() }))
  .sort((a, b) => b.time - a.time);

if (files.length > 0) {
  const file = files[0].name;
  console.log(`\n📂 正在讀取最新下載的檔案: ${file}`);
  const data = fs.readFileSync(`${dir}/${file}`);
  const workbook = xlsx.read(data, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log('\n--- 前 20 行解析結果 ---');
  rows.slice(0, 20).forEach((row, i) => {
    console.log(`行 ${i}:`, row);
  });
} else {
  console.log("找不到 report 開頭的 xls/xlsx 檔案");
}
