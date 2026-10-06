const fs = require('fs');
let c = fs.readFileSync('lib/agent/sales-agent.ts', 'utf8');

c = c.split('- [${p.sku}] ').join('- ');
c = c.split('* [${p.sku}]').join('*');

fs.writeFileSync('lib/agent/sales-agent.ts', c);
