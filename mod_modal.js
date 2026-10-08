const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

code = code.replace(
  /\s*<\/div>\s*<\/div>\s*\{\/\* ORDER DETAILS MODAL \*\/\}/g,
  '\n      {/* ORDER DETAILS MODAL */}'
);

fs.writeFileSync('app/panel/page.tsx', code);
