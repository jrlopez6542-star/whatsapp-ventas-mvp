const fs = require('fs');

let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

const regex = /\{conversations\.find\(c => c\.id === selectedConvId\)\?\.status === "bot" \? \([\s\S]*?Cerrar Caso[\s\S]*?<\/button>\s*<\/div>/;

const replace = `{conversations.find(c => c.id === selectedConvId)?.status === "bot" ? (
                        <button onClick={() => handleToggleBot(selectedConvId, "human")} title="Pausar Bot / Tomar Control Manual" className="flex items-center gap-2 bg-[#007aff] hover:bg-[#005bb5] text-white font-semibold text-sm p-2 md:px-4 md:py-2 rounded-lg shadow-sm transition">
                          <i className="ph-fill ph-pause"></i>
                          <span className="hidden md:inline">Pausar Bot</span>
                        </button>
                      ) : (
                        <button onClick={() => handleToggleBot(selectedConvId, "bot")} title="Reactivar Bot Automático" className="flex items-center gap-2 bg-[#007aff] hover:bg-[#005bb5] text-white font-semibold text-sm p-2 md:px-4 md:py-2 rounded-lg shadow-sm transition">
                          <i className="ph-fill ph-play"></i>
                          <span className="hidden md:inline">Activar Bot</span>
                        </button>
                      )}
                      <button onClick={() => handleToggleBot(selectedConvId, "closed")} title="Cerrar Caso" className="flex items-center gap-2 text-slate-300 hover:text-white p-2 md:px-3 md:py-2 text-sm rounded-lg border border-[#2a3942] hover:bg-[#202c33] transition">
                        <i className="ph ph-x"></i> <span className="hidden md:inline">Cerrar Caso</span>
                      </button>
                    </div>`;

code = code.replace(regex, replace);

fs.writeFileSync('app/panel/page.tsx', code);
console.log("Replaced chat buttons block");
