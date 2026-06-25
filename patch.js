const fs = require('fs');
const file = '/Users/liuyaping/Downloads/schedule/pages/DashboardPage.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace stationSheet maxLines logic
content = content.replace(
  /const rowData: any\[\] = \[rowConfig\.label\];\s+dateRange\.forEach\(\(date\) => {/,
  `const rowData: any[] = [rowConfig.label];\n        let maxLines = 1;\n\n        dateRange.forEach((date) => {`
);

content = content.replace(
  /const cellContent = contentParts\.join\("\\n"\); \/\/ Stack multiple people\s+rowData\.push\(cellContent\);\s+}\);/g,
  `const cellContent = contentParts.join("\\n"); // Stack multiple people
          rowData.push(cellContent);
          
          const lineCount = cellContent.split("\\n").length;
          if (lineCount > maxLines) maxLines = lineCount;
        });`
);

content = content.replace(
  /const row = stationSheet\.addRow\(rowData\);\s+row\.height = 40;/g,
  `const row = stationSheet.addRow(rowData);
        row.height = Math.max(30, maxLines * 16);`
);

fs.writeFileSync(file, content);
console.log('Patched DashboardPage.tsx');
