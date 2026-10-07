const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

code = code.replace(/formatDate\(/g, 'formatDateDisplay(');

fs.writeFileSync('app/panel/page.tsx', code);
console.log("Fixed formatDateDisplay");
