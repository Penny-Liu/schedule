const fs = require('fs');
let code = fs.readFileSync('services/store.ts', 'utf8');

const regex = /private async fetchWorkloadsByRange\(startMonth: string, endMonth: string\) \{\s*return this\.fetchPaginated\("radiographer_workload", \(q\) => q\.gte\("date", startMonth\)\.lte\("date", endMonth\)\);\s*\}/m;

const replacement = `private async fetchWorkloadsByRange(startMonth: string, endMonth: string) {
    const startY = parseInt(startMonth.split("-")[0]);
    const endY = parseInt(endMonth.split("-")[0]);
    return this.fetchPaginated("radiographer_workload", (q) => q.gte("year", startY).lte("year", endY));
  }`;

if (code.match(regex)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync('services/store.ts', code);
  console.log('Fixed fetchWorkloadsByRange query');
} else {
  console.log('Regex not found');
}
