const fs = require('fs');
let c = fs.readFileSync('lib/store/index.ts', 'utf8');

c = c.replace(
  /try \{\s*await client\.execute\(\{[\s\S]*?sql: `INSERT INTO messages[\s\S]*?\}\);[\s\S]*?\}\);\s*\}\s*\}/g,
  `try {
        await client.execute({
          sql: \`INSERT INTO messages (conversation_id, role, content, at, created_at) VALUES (?, ?, ?, "", ?)\`,
          args: [conversationId, role, content, memoryMsg.createdAt],
        });
      }`
);

fs.writeFileSync('lib/store/index.ts', c);
