const fs = require('fs');
let code = fs.readFileSync('services/store.ts', 'utf8');

const regex1 = /this\.doctors = doctorsRes\.data\.map\(\(d: any\) => \(\{ \.\.\.d, capabilities: d\.capabilities \|\| \[\], locations: d\.locations \|\| \[\], isPartTime: d\.is_part_time \|\| false \}\)\);/g;

const replacement1 = `this.doctors = doctorsRes.data.map((d: any) => { const m = {...d}; this.mapFromDbFields(m); m.capabilities = m.capabilities || []; m.locations = m.locations || []; return m; });`;

if (code.match(regex1)) {
  code = code.replace(regex1, replacement1);
  fs.writeFileSync('services/store.ts', code);
  console.log('Fixed doctors mapping');
} else {
  console.log('Regex for doctors not found');
}
