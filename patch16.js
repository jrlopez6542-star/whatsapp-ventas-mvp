const fs = require('fs');
let lines = fs.readFileSync('lib/store/index.ts', 'utf8').split('\n');

const startIndex = lines.findIndex(l => l.includes('sql: `INSERT INTO messages (id, conversation_id, role, content, created_at)'));

if (startIndex !== -1) {
  // Start from 'try {' above
  const startReplace = startIndex - 2; 
  // Find the end '}' that matches the 'try {'
  let endReplace = startReplace;
  for(let i=startReplace; i<lines.length; i++){
    if(lines[i].includes('      await client.execute({') && lines[i+1].includes('sql: "UPDATE conversations SET updated_at')) {
      endReplace = i - 1;
      break;
    }
  }

  const replacement = `      await client.execute({
        sql: \`INSERT INTO messages (conversation_id, role, content, at, created_at) VALUES (?, ?, ?, "", ?)\`,
        args: [conversationId, role, content, memoryMsg.createdAt],
      });`;

  lines.splice(startReplace, endReplace - startReplace + 1, replacement);
  fs.writeFileSync('lib/store/index.ts', lines.join('\n'));
  console.log("Patched correctly!");
} else {
  console.log("Not found");
}
