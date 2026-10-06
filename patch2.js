const fs = require('fs');
let c = fs.readFileSync('lib/agent/sales-agent.ts', 'utf8');
c = c.replace(
  'detectedTotal = defaultProduct.price;\n  }',
  'detectedTotal = defaultProduct.price;\n  }\n\n  if (detectedTotal === 0) {\n    const totalMatch = combined.match(/total[^\\d]*?(\\d[\\d.,]*)/i);\n    if (totalMatch) {\n      detectedTotal = parseInt(totalMatch[1].replace(/[.,]/g, ""), 10);\n    }\n  }'
);
fs.writeFileSync('lib/agent/sales-agent.ts', c);
