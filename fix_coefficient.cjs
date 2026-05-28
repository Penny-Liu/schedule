const fs = require('fs');
const path = 'components/dashboard/PhysicianWorkloadAnalysis.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(/doctor\.total_dazhi_1 \* 0\.8;/g, 'doctor.total_dazhi_1 * 0.6;');
code = code.replace(/"直0\.8"/g, '"直0.6"');
code = code.replace(/>\s*直0\.8\s*</g, '>直0.6<');

fs.writeFileSync(path, code);
console.log('Fixed coefficient');
