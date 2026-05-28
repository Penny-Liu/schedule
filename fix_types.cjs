const fs = require('fs');
let types = fs.readFileSync('types.ts', 'utf8');

if (!types.includes('tsmcReport: number;')) {
  types = types.replace(/proofreader: number;/, 'proofreader: number;\n  tsmcReport?: number;');
  fs.writeFileSync('types.ts', types);
  console.log('Added tsmcReport to types.ts');
} else {
  console.log('Already has tsmcReport');
}
