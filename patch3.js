const fs = require('fs');
let c = fs.readFileSync('lib/store/index.ts', 'utf8');

c = c.replace(
  'INSERT INTO messages (id, conversation_id, role, content, created_at)\n                  VALUES (?, ?, ?, ?, ?)',
  'INSERT INTO messages (id, conversation_id, role, content, created_at, at)\n                  VALUES (?, ?, ?, ?, ?, "")'
);

c = c.replace(
  'INSERT INTO messages (conversation_id, role, content, created_at)\n                  VALUES (?, ?, ?, ?)',
  'INSERT INTO messages (conversation_id, role, content, created_at, at)\n                  VALUES (?, ?, ?, ?, "")'
);

c = c.replace(
  'INSERT INTO messages (conversation_id, role, content, created_at)\n                    VALUES (?, ?, ?, ?)',
  'INSERT INTO messages (conversation_id, role, content, created_at, at)\n                    VALUES (?, ?, ?, ?, "")'
);

fs.writeFileSync('lib/store/index.ts', c);
