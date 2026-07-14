const fs = require('fs');
const path = require('path');
const file = path.join('/Users/liuyaping/Downloads/schedule/', 'types.ts');
let content = fs.readFileSync(file, 'utf8');

const newTypes = `
export interface DailyGeneSchedule {
  isOpen: boolean;
  startTime: string; // "08:00"
  endTime: string; // "17:00"
  maxAppointmentsPerSlot: number; // e.g. 1
}

export interface GeneRule {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  intervalMinutes: number; // e.g. 30
  schedules: DailyGeneSchedule[]; // Array of 7, index 0=Sun, 1=Mon...
}
`;

if (!content.includes('DailyGeneSchedule')) {
  // Replace the old GeneSettings block with the new one + GeneRule + DailyGeneSchedule
  content = content.replace(
    /export interface GeneSettings \{[^}]+\}/,
    newTypes + '\nexport interface GeneSettings {\n  rules: GeneRule[];\n}'
  );
  fs.writeFileSync(file, content);
  console.log("Updated types.ts");
}
