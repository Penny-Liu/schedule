const fs = require('fs');
let code = fs.readFileSync('services/store.ts', 'utf8');

const regex = /private async fetchLeavesByRange\(startDate: string, endDate: string\) \{\s*return this\.fetchPaginated\("leaves", \(q\) => q\.gte\("startDate", startDate\)\.lte\("endDate", endDate\)\.or\(`endDate\.gte\.\$\{startDate\},startDate\.lte\.\$\{endDate\}`\)\);\s*\}/;

const replacement = `private async fetchLeavesByRange(startDate: string, _endDate: string) {
    return this.fetchPaginated("leaves", (q) => q.gte("endDate", startDate));
  }`;

if (code.match(regex)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync('services/store.ts', code);
  console.log('Fixed fetchLeavesByRange query');
} else {
  console.log('Regex not found');
}
