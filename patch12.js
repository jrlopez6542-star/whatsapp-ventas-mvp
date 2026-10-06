const fs = require('fs');
let c = fs.readFileSync('app/panel/page.tsx', 'utf8');

c = c.replace('{ cache: "no-store", ..., {', '{ cache: "no-store",');

fs.writeFileSync('app/panel/page.tsx', c);
