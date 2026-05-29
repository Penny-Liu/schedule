const fs = require('fs');
let code = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');

code = code.replace(/uses: actions\/checkout@v3/g, 'uses: actions/checkout@v4');
code = code.replace(/uses: actions\/setup-node@v3/g, 'uses: actions/setup-node@v4');
code = code.replace(/node-version: '18'/g, 'node-version: "20"');
code = code.replace(/^jobs:/m, 'env:\n  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true\n\njobs:');

fs.writeFileSync('.github/workflows/deploy.yml', code);
