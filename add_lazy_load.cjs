const fs = require('fs');

const pagesToUpdate = [
  'AdministrativeSchedulePage.tsx',
  'CloudSchedulePage.tsx',
  'DashboardPage.tsx',
  'HealthMgmtPage.tsx',
  'MeetingRoomPage.tsx',
  'PhysicianSchedulePage.tsx',
  'StatisticsPage.tsx'
];

for (const page of pagesToUpdate) {
  const filepath = `pages/${page}`;
  if (!fs.existsSync(filepath)) continue;
  
  let code = fs.readFileSync(filepath, 'utf8');
  
  // Find where currentDate is declared
  const regex = /const \[currentDate, setCurrentDate\] = useState.*?;\n/m;
  if (regex.test(code)) {
    // Only add if not already there
    if (!code.includes('db.loadDataForMonth(currentDate.getFullYear(), currentDate.getMonth() + 1)')) {
      const effectCode = `\n  useEffect(() => {\n    db.loadDataForMonth(currentDate.getFullYear(), currentDate.getMonth() + 1);\n  }, [currentDate]);\n`;
      code = code.replace(regex, match => match + effectCode);
      fs.writeFileSync(filepath, code);
      console.log(`Updated ${page}`);
    }
  }
}

// Special case: LeavePage uses viewDate
let leaveCode = fs.readFileSync('pages/LeavePage.tsx', 'utf8');
const leaveRegex = /const \[viewDate, setViewDate\] = useState.*?;\n/m;
if (leaveRegex.test(leaveCode) && !leaveCode.includes('db.loadDataForMonth(viewDate')) {
    const effectCode = `\n  useEffect(() => {\n    db.loadDataForMonth(viewDate.getFullYear(), viewDate.getMonth() + 1);\n  }, [viewDate]);\n`;
    leaveCode = leaveCode.replace(leaveRegex, match => match + effectCode);
    fs.writeFileSync('pages/LeavePage.tsx', leaveCode);
    console.log(`Updated LeavePage.tsx`);
}

// Special case: RadiographerWorkloadPage uses currentMonth string (e.g. "2026-05")
let radCode = fs.readFileSync('pages/RadiographerWorkloadPage.tsx', 'utf8');
const radRegex = /const \[currentMonth, setCurrentMonth\] = useState<string>\(\(\) => \{[\s\S]*?\}\);\n/m;
if (radRegex.test(radCode) && !radCode.includes('db.loadDataForMonth(parseInt(')) {
    const effectCode = `\n  useEffect(() => {\n    const [y, m] = currentMonth.split('-').map(Number);\n    db.loadDataForMonth(y, m);\n  }, [currentMonth]);\n`;
    radCode = radCode.replace(radRegex, match => match + effectCode);
    fs.writeFileSync('pages/RadiographerWorkloadPage.tsx', radCode);
    console.log(`Updated RadiographerWorkloadPage.tsx`);
}

