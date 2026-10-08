const fs = require('fs');

let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

// 1. Fix Hamburger visibility
code = code.replace(
  '{isMobileMode && !showMobileSidebar && (',
  '{isMobileMode && !showMobileSidebar && !(tab === "chats" && selectedConvId) && ('
);

// 2. Fix Chat Header buttons to be icon-only on mobile
const searchBotBtn = /<button onClick=\{\(\) => handleToggleBot\(selectedConvId, "human"\)\} className="flex items-center gap-2 bg-\[#007aff\] hover:bg-\[#005bb5\] text-white font-semibold text-sm px-4 py-2 rounded-lg shadow-sm transition">\s*<i className="ph ph-pause"><\/i> Bot \/ Tomar Control Manual\s*<\/button>/g;

const replaceBotBtn = `<button onClick={() => handleToggleBot(selectedConvId, "human")} className="flex items-center gap-2 bg-[#007aff] hover:bg-[#005bb5] text-white font-semibold text-sm p-2 md:px-4 md:py-2 rounded-lg shadow-sm transition" title="Bot / Tomar Control Manual">
                          <i className="ph ph-pause text-lg"></i> <span className="hidden md:inline">Bot / Control Manual</span>
                        </button>`;

const searchHumanBtn = /<button onClick=\{\(\) => handleToggleBot\(selectedConvId, "bot"\)\} className="flex items-center gap-2 bg-\[#202c33\] hover:bg-\[#2a3942\] text-slate-300 border border-\[#2a3942\] font-semibold text-sm px-4 py-2 rounded-lg transition">\s*<i className="ph ph-play"><\/i> Humano \/ Activar Bot\s*<\/button>/g;

const replaceHumanBtn = `<button onClick={() => handleToggleBot(selectedConvId, "bot")} className="flex items-center gap-2 bg-[#202c33] hover:bg-[#2a3942] text-slate-300 border border-[#2a3942] font-semibold text-sm p-2 md:px-4 md:py-2 rounded-lg transition" title="Humano / Activar Bot">
                          <i className="ph ph-play text-lg"></i> <span className="hidden md:inline">Humano / Activar Bot</span>
                        </button>`;

const searchCloseBtn = /<button onClick=\{\(\) => handleCloseChat\(selectedConvId\)\} className="flex items-center gap-2 bg-\[#121b22\] hover:bg-red-500\/20 text-red-400 hover:text-red-300 border border-\[#1f2c34\] hover:border-red-500\/50 font-semibold text-sm px-4 py-2 rounded-lg transition">\s*<i className="ph ph-x"><\/i> Cerrar Caso\s*<\/button>/g;

const replaceCloseBtn = `<button onClick={() => handleCloseChat(selectedConvId)} className="flex items-center gap-2 bg-[#121b22] hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-[#1f2c34] hover:border-red-500/50 font-semibold text-sm p-2 md:px-4 md:py-2 rounded-lg transition" title="Cerrar Caso">
                        <i className="ph ph-check-circle text-lg"></i> <span className="hidden md:inline">Cerrar Caso</span>
                      </button>`;


code = code.replace(searchBotBtn, replaceBotBtn);
code = code.replace(searchHumanBtn, replaceHumanBtn);
code = code.replace(searchCloseBtn, replaceCloseBtn);

fs.writeFileSync('app/panel/page.tsx', code);
console.log("Chat interface improved");
