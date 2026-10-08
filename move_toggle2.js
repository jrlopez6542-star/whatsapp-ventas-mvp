const fs = require('fs');

let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

// Remove floating toggle button
code = code.replace(/\{\/\* MOBILE TOGGLE BUTTON \(FLOATING\) \*\/\}\s*<button[\s\S]*?<\/button>/, '');

const sidebarBtn = `<button onClick={() => setIsMobileMode(prev => {
                const next = !prev;
                if (typeof window !== "undefined") localStorage.setItem("crm_mobile_mode", String(next));
                return next;
              })} className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition text-slate-400 hover:bg-[#202c33] hover:text-white">
                {isMobileMode ? (
                  <><i className="ph ph-desktop text-lg"></i> Modo Escritorio</>
                ) : (
                  <><i className="ph ph-device-mobile text-lg"></i> Modo Móvil</>
                )}
              </button>`;

code = code.replace('<div className="p-2 space-y-1">', '<div className="p-2 space-y-1">\n              ' + sidebarBtn);

fs.writeFileSync('app/panel/page.tsx', code);
console.log("Moved toggle button");
