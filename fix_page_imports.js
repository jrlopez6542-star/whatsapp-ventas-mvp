const fs = require('fs');
let pageCode = fs.readFileSync('app/panel/page.tsx', 'utf8');
const lines = pageCode.split('\n');
const fixed = lines.filter(l => !l.includes('import { QrModal } from "./QrModal"') && !l.includes('"use client"'));
fixed.unshift('import { QrModal } from "./QrModal";');
fixed.unshift('"use client";');
fs.writeFileSync('app/panel/page.tsx', fixed.join('\n'));
