const fs = require('fs');

let pageCode = fs.readFileSync('app/panel/page.tsx', 'utf8');
pageCode = pageCode.replace('import { QrModal } from "./QrModal";\n', '');
pageCode = pageCode.replace('"use client";', '"use client";\nimport { QrModal } from "./QrModal";');
fs.writeFileSync('app/panel/page.tsx', pageCode);

let qrCode = fs.readFileSync('app/panel/QrModal.tsx', 'utf8');
qrCode = '"use client";\n' + qrCode;
fs.writeFileSync('app/panel/QrModal.tsx', qrCode);
