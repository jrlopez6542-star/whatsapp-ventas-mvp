const fs = require('fs');
let c = fs.readFileSync('lib/store/index.ts', 'utf8');

c = c.replace(
  /sql: \`INSERT INTO messages \(id, conversation_id, role, content, created_at\)\\n\s*VALUES \(\?, \?, \?, \?, \?\)\`,/,
  'sql: `INSERT INTO messages (id, conversation_id, role, content, at, created_at)\\n              VALUES (?, ?, ?, ?, "", ?)`,'
);

fs.writeFileSync('lib/store/index.ts', c);
