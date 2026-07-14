const fs = require('fs');
const path = require('path');
const file = path.join('/Users/liuyaping/Downloads/schedule/', 'types.ts');
let content = fs.readFileSync(file, 'utf8');

const geneTypes = `
export interface GeneAppointment {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  medicalRecordNumber: string;
  registeredBy: string;
  createdAt?: string;
}

export interface GeneSettings {
  openDays: number[]; // 0=Sun, 1=Mon...
  startTime: string; // e.g. "08:00"
  endTime: string; // e.g. "17:00"
  intervalMinutes: number; // e.g. 30
}
`;

if (!content.includes('GeneAppointment')) {
  content += geneTypes;
  fs.writeFileSync(file, content);
  console.log("Updated types.ts");
}
