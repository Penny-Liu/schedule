const fs = require('fs');
let code = fs.readFileSync('services/store.ts', 'utf8');

// Fix doctorShifts mapping in initializeDataForUser
const regexDShifts = /this\.doctorShifts = dShiftsRes\.data\.map\(\(s: any\) => \(\{ \.\.\.s, doctorId: s\.doctor_id, workTime: s\.work_time, scheduled_station: s\.scheduled_station \}\)\);/g;
const replaceDShifts = `this.doctorShifts = dShiftsRes.data.map((s: any) => { const m = {...s}; this.mapFromDbFields(m); return m; });`;
code = code.replace(regexDShifts, replaceDShifts);

// Fix anesthesiaShifts mapping in initializeDataForUser
const regexAShifts = /this\.anesthesiaShifts = anesthesiaShiftsRes\.data\.map\(\(s: any\) => \(\{ \.\.\.s, userId: s\.user_id, workTime: s\.work_time, scheduled_station: s\.scheduled_station \}\)\);/g;
const replaceAShifts = `this.anesthesiaShifts = anesthesiaShiftsRes.data.map((s: any) => { const m = {...s}; this.mapFromDbFields(m); return m; });`;
code = code.replace(regexAShifts, replaceAShifts);

// Fix meetingRoomBookings mapping in initializeDataForUser
const regexMR = /this\.meetingRoomBookings = meetingRoomsRes\.data\.map\(\(m: any\) => \(\{ \.\.\.m, userId: m\.user_id, startTime: m\.start_time, endTime: m\.end_time \}\)\);/g;
const replaceMR = `this.meetingRoomBookings = meetingRoomsRes.data.map((b: any) => { const m = {...b}; this.mapFromDbFields(m); return m; });`;
code = code.replace(regexMR, replaceMR);

fs.writeFileSync('services/store.ts', code);
console.log('Fixed additional mappings in initializeDataForUser');
