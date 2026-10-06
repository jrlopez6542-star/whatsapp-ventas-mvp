const fs = require('fs');
let c = fs.readFileSync('lib/store/index.ts', 'utf8');

const regex = /try\s*\{\s*await ensureTursoReady\(\);\s*const client = getTursoClient\(\);\s*try\s*\{\s*await client\.execute\(\{[\s\S]*?catch\(async \(\) => \{\s*await client\.execute\(\{[\s\S]*?\}\);\s*\}\);\s*\}/;

const replaceStr = `try {
        await ensureTursoReady();
        const client = getTursoClient();
        await client.execute({
          sql: \`INSERT INTO messages (conversation_id, role, content, at, created_at) VALUES (?, ?, ?, "", ?)\`,
          args: [conversationId, role, content, memoryMsg.createdAt],
        });`;

if(regex.test(c)) {
  c = c.replace(regex, replaceStr);
  fs.writeFileSync('lib/store/index.ts', c);
  console.log("Patched successfully");
} else {
  console.log("Could not find regex.");
}
