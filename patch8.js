const fs = require('fs');
let c = fs.readFileSync('app/panel/page.tsx', 'utf8');

c = c.replace(/await fetch\("\/api\/panel\/conversations"\)/g, 'await fetch("/api/panel/conversations", { cache: "no-store" })');
c = c.replace(/await fetch\("\/api\/panel\/orders"\)/g, 'await fetch("/api/panel/orders", { cache: "no-store" })');
c = c.replace(/await fetch\("\/api\/panel\/products"\)/g, 'await fetch("/api/panel/products", { cache: "no-store" })');
c = c.replace(/await fetch\("\/api\/panel\/settings"\)/g, 'await fetch("/api/panel/settings", { cache: "no-store" })');

// Check the sku issue: "que los productos no tengan el sku al ofrecer al cliente"
// That's in sales-agent.ts

fs.writeFileSync('app/panel/page.tsx', c);
