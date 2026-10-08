const fs = require('fs');

let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

code = code.replace('Bot / Tomar Control Manual', '<span className="hidden md:inline ml-2">Bot / Control</span>');
code = code.replace('Humano / Activar Bot', '<span className="hidden md:inline ml-2">Activar Bot</span>');
code = code.replace('Cerrar Caso', '<span className="hidden md:inline ml-2">Cerrar Caso</span>');

code = code.replace(/px-4 py-2 rounded-lg shadow-sm/g, 'p-2 md:px-4 md:py-2 rounded-lg shadow-sm');
code = code.replace(/px-4 py-2 rounded-lg transition/g, 'p-2 md:px-4 md:py-2 rounded-lg transition');

fs.writeFileSync('app/panel/page.tsx', code);
console.log("Chat buttons shrunk for mobile");
