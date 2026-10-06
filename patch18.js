const fs = require('fs');
let c = fs.readFileSync('lib/store/index.ts', 'utf8');

c = c.replace(
  'sql: `INSERT INTO messages (conversation_id, role, content, at, created_at) VALUES (?, ?, ?, "", ?)`',
  "sql: `INSERT INTO messages (conversation_id, role, content, at, created_at) VALUES (?, ?, ?, '', ?)`"
);

fs.writeFileSync('lib/store/index.ts', c);
console.log("Patched!!");
