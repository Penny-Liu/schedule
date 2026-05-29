const fs = require('fs');
let code = fs.readFileSync('services/store.ts', 'utf8');

// Fix doctorShifts mapping in loadDataForMonth
const regexDShifts = /const parsed = dShiftsRes\.data\.map\(\(s: any\) => \(\{ \.\.\.s, doctorId: s\.doctor_id, workTime: s\.work_time, scheduled_station: s\.scheduled_station \}\)\);/g;
const replaceDShifts = `const parsed = dShiftsRes.data.map((s: any) => { const m = {...s}; this.mapFromDbFields(m); return m; });`;
code = code.replace(regexDShifts, replaceDShifts);

// Fix anesthesiaShifts mapping in loadDataForMonth
const regexAShifts = /const parsed = aneShiftsRes\.data\.map\(\(s: any\) => \(\{ \.\.\.s, userId: s\.user_id, workTime: s\.work_time, scheduled_station: s\.scheduled_station \}\)\);/g;
const replaceAShifts = `const parsed = aneShiftsRes.data.map((s: any) => { const m = {...s}; this.mapFromDbFields(m); return m; });`;
code = code.replace(regexAShifts, replaceAShifts);

// Fix meetingRooms mapping in loadDataForMonth
const regexMR = /const parsed = meetingRoomsRes\.data\.map\(\(m: any\) => \(\{ \.\.\.m, userId: m\.user_id, startTime: m\.start_time, endTime: m\.end_time \}\)\);/g;
const replaceMR = `const parsed = meetingRoomsRes.data.map((b: any) => { const m = {...b}; this.mapFromDbFields(m); return m; });`;
code = code.replace(regexMR, replaceMR);

fs.writeFileSync('services/store.ts', code);
console.log('Fixed additional mappings in loadDataForMonth');
