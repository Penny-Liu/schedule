import fs from 'fs';
const data = JSON.parse(fs.readFileSync('/Users/liuyaping/Downloads/schedule/db.json', 'utf8'));
console.log("weights:", data.settings?.weights);
