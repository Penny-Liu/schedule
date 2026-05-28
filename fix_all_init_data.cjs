const fs = require('fs');

const files = [
  'pages/AdministrativeSchedulePage.tsx',
  'pages/PhysicianSchedulePage.tsx',
  'services/store.ts'
];

for (const filepath of files) {
  if (!fs.existsSync(filepath)) continue;
  let code = fs.readFileSync(filepath, 'utf8');
  
  if (filepath.endsWith('store.ts')) {
    code = code.replace(/await this\.initializeData\(true\);/g, 'await this.initializeAuthData(true);\n      if (this.currentUser) await this.initializeDataForUser(this.currentUser, true);');
  } else {
    code = code.replace(/db\.initializeData\(\)\.then\(\(\) => \{/g, 'Promise.all([db.initializeAuthData(), db.currentUser ? db.initializeDataForUser(db.currentUser) : Promise.resolve()]).then(() => {');
  }

  fs.writeFileSync(filepath, code);
}
console.log('Fixed remaining initializeData');
