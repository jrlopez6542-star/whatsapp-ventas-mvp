const fs = require('fs');
let code = fs.readFileSync('lib/store/index.ts', 'utf8');
code = code.replace(
  'console.error("[store] createOrder Turso error:", err);',
  'console.error("[store] createOrder Turso error:", err); throw err;'
);
fs.writeFileSync('lib/store/index.ts', code);
