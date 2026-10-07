const fs = require('fs');
let code = fs.readFileSync('app/api/panel/test-ai/route.ts', 'utf8');

code = code.replace(/\\\`/g, '`');
code = code.replace(/\\\$/g, '$');

fs.writeFileSync('app/api/panel/test-ai/route.ts', code);
console.log("Fixed syntax in app/api/panel/test-ai/route.ts");
