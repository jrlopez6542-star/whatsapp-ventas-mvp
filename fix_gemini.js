const fs = require('fs');
let code = fs.readFileSync('app/api/gemini-check/route.ts', 'utf8');
code = code.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync('app/api/gemini-check/route.ts', code);
