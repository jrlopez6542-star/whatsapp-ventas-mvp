const fs = require('fs');

let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

const search = /className="fixed bottom-4 right-4 z-\[999999\] bg-\[#007aff\] hover:bg-\[#005bb5\] text-white p-3.5 rounded-full shadow-2xl transition-transform hover:scale-105 flex items-center justify-center"/;

const replace = `className="fixed top-4 right-4 z-[999999] bg-[#202c33] hover:bg-[#2a3942] text-slate-300 p-2 rounded-md shadow-md transition-transform flex items-center justify-center border border-[#2a3942]"`;

// Wait, the previous search used p-3.5. Let's use a regex that catches any bottom-4 right-4
const searchRegex = /className="fixed bottom-4 right-4 [^"]+"/;

code = code.replace(searchRegex, replace);

fs.writeFileSync('app/panel/page.tsx', code);
console.log("Updated toggle button position");
