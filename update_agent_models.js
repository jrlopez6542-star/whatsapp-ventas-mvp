const fs = require('fs');
let code = fs.readFileSync('lib/agent/sales-agent.ts', 'utf8');

code = code.replace(
  '"gemini-3-flash-preview",\n      "gemini-2.5-flash",',
  '"gemini-3-flash-preview",\n      "gemini-2.5-flash",\n      "gemini-2.0-flash",\n      "gemini-1.5-flash",'
);

fs.writeFileSync('lib/agent/sales-agent.ts', code);
console.log("Updated lib/agent/sales-agent.ts with reliable fallbacks");
