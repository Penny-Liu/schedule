const fs = require('fs');
let code = fs.readFileSync('services/store.ts', 'utf8');

const regex2 = /this\.healthMgmtStaff = hmStaffRes\.data\.map\(\(s: any\) => \(\{ \.\.\.s, isActive: s\.is_active \}\)\);/g;
const replacement2 = `this.healthMgmtStaff = hmStaffRes.data.map((s: any) => { const m = {...s}; this.mapFromDbFields(m); return m; });`;

const regex3 = /this\.anesthesiaStaff = anesthesiaStaffRes\.data\.map\(\(s: any\) => \(\{ \.\.\.s, isActive: s\.is_active \}\)\);/g;
const replacement3 = `this.anesthesiaStaff = anesthesiaStaffRes.data.map((s: any) => { const m = {...s}; this.mapFromDbFields(m); return m; });`;

code = code.replace(regex2, replacement2);
code = code.replace(regex3, replacement3);
fs.writeFileSync('services/store.ts', code);
console.log('Fixed hm and anesthesia staff mapping');
