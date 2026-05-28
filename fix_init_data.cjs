const fs = require('fs');

const pagesToUpdate = [
  'pages/AdministrativeSchedulePage.tsx',
  'pages/DashboardPage.tsx',
  'pages/MeetingRoomPage.tsx',
  'pages/PhysicianSchedulePage.tsx',
  'services/store.ts'
];

for (const filepath of pagesToUpdate) {
  if (!fs.existsSync(filepath)) continue;
  let code = fs.readFileSync(filepath, 'utf8');
  
  // Replace db.initializeData(...) with db.initializeAuthData(...) and db.initializeDataForUser(...)
  code = code.replace(/await db\.initializeData\((.*?)\);/g, 'await db.initializeAuthData($1); if (db.currentUser) await db.initializeDataForUser(db.currentUser, $1);');
  code = code.replace(/db\.initializeData\((.*?)\);/g, 'db.initializeAuthData($1); if (db.currentUser) db.initializeDataForUser(db.currentUser, $1);');
  
  // Clean up cases where it was empty
  code = code.replace(/initializeAuthData\(\)/g, 'initializeAuthData(true)');
  code = code.replace(/initializeDataForUser\(db.currentUser, \)/g, 'initializeDataForUser(db.currentUser, true)');

  fs.writeFileSync(filepath, code);
}

let storeCode = fs.readFileSync('services/store.ts', 'utf8');
// Fix fetchAllDoctorShifts
storeCode = storeCode.replace(/await this\.fetchAllDoctorShifts\(\)/g, 'await this.fetchDoctorShiftsByRange(this.getWindowDates(new Date()).startDate, this.getWindowDates(new Date()).endDate)');

fs.writeFileSync('services/store.ts', storeCode);
console.log('Fixed initializeData references');
