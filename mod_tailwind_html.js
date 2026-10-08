const fs = require('fs');

const file = fs.readFileSync('app/panel/page.tsx', 'utf8');
const searchString = '  return (\n    <div className="crm-layout">';
const returnIndex = file.lastIndexOf(searchString);

if (returnIndex === -1) {
  console.log("NOT FOUND!");
  process.exit(1);
}

const beforeReturn = file.substring(0, returnIndex);

const jsx = `  return (
    <>
      <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
      <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />
      <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css" />
      
      <div className="bg-[#0b141a] text-slate-200 font-sans antialiased h-screen overflow-hidden flex select-none">
        
        {/* 1. BARRA LATERAL IZQUIERDA (NAVEGACIÓN) */}
        <aside className="w-60 bg-[#111b21] border-r border-[#222e35] flex flex-col justify-between shrink-0">
          <div>
            <div className="h-16 flex items-center gap-3 px-5 border-b border-[#222e35]">
              <div className="w-10 h-10 rounded-full bg-[#00a884]/20 text-[#00a884] flex items-center justify-center text-2xl font-bold">
                <i className="ph-fill ph-whatsapp-logo"></i>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm tracking-wide text-white">Bot Manager</span>
                <div className="flex items-center gap-1.5 text-xs text-[#00a884] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#00a884] animate-pulse"></span>
                  API Conectada
                </div>
              </div>
            </div>

            <nav className="p-3 space-y-1 text-sm font-medium">
              <button onClick={() => setTab("orders")} className={\`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition \${tab==='orders' ? 'bg-[#202c33] text-white font-semibold' : 'text-slate-400 hover:text-white hover:bg-[#202c33]'}\`}>
                <i className="ph ph-squares-four text-lg"></i> Pedidos (Dashboard)
              </button>
              <button onClick={() => setTab("chats")} className={\`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg transition \${tab==='chats' ? 'bg-[#202c33] text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-white hover:bg-[#202c33]'}\`}>
                <div className="flex items-center gap-3">
                  <i className={\`ph-fill ph-chat-circle-dots text-lg \${tab==='chats' ? 'text-[#00a884]' : ''}\`}></i> Chats en Vivo
                </div>
                <span className="bg-[#00a884] text-[#111b21] text-xs font-bold px-2 py-0.5 rounded-full">{conversations.length}</span>
              </button>
              <button onClick={() => setTab("catalog")} className={\`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition \${tab==='catalog' ? 'bg-[#202c33] text-white font-semibold' : 'text-slate-400 hover:text-white hover:bg-[#202c33]'}\`}>
                <i className="ph ph-article text-lg"></i> Menú / Catálogo
              </button>
              <button onClick={() => setTab("hours")} className={\`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition \${tab==='hours' ? 'bg-[#202c33] text-white font-semibold' : 'text-slate-400 hover:text-white hover:bg-[#202c33]'}\`}>
                <i className="ph ph-clock text-lg"></i> Horarios
              </button>
              <button onClick={() => setTab("qr")} className={\`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition \${tab==='qr' ? 'bg-[#202c33] text-white font-semibold' : 'text-slate-400 hover:text-white hover:bg-[#202c33]'}\`}>
                <i className="ph ph-qr-code text-lg"></i> Vincular WhatsApp
              </button>
            </nav>
          </div>

          <div className="p-3 border-t border-[#222e35]">
            <button onClick={() => setTab("settings")} className={\`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition text-sm \${tab==='settings' ? 'bg-[#202c33] text-white font-semibold' : 'text-slate-400 hover:text-white hover:bg-[#202c33]'}\`}>
              <i className="ph ph-gear text-lg"></i> Configuración IA
            </button>
          </div>
        </aside>

        {tab === "chats" && (
          <>
            {/* 2. BANDEJA DE CHATS */}
            <section className="w-80 bg-[#111b21] border-r border-[#222e35] flex flex-col shrink-0">
              <div className="p-4 border-b border-[#222e35]">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-white tracking-tight">Chats en Vivo</h2>
                  <span className="text-xs bg-[#202c33] text-slate-300 px-2 py-0.5 rounded font-mono">{filteredChats.length} Activos</span>
                </div>
                <div className="relative">
                  <i className="ph ph-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-base"></i>
                  <input 
                    type="text" 
                    placeholder="Buscar número o cliente..." 
                    className="w-full bg-[#202c33] text-sm text-white placeholder-slate-400 pl-9 pr-3 py-2 rounded-lg border border-transparent focus:border-[#00a884] focus:outline-none transition"
                  />
                </div>

                <div className="flex gap-1.5 mt-3 text-xs font-medium">
                  <button onClick={() => setChatFilter("all")} className={\`px-2.5 py-1 rounded \${chatFilter === "all" ? "bg-[#202c33] text-white border border-[#2a3942]" : "text-slate-400 hover:text-slate-200"}\`}>Todos</button>
                  <button onClick={() => setChatFilter("human")} className={\`px-2.5 py-1 rounded \${chatFilter === "human" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "text-slate-400 hover:text-slate-200"}\`}>Requiere Humano</button>
                  <button onClick={() => setChatFilter("bot")} className={\`px-2.5 py-1 rounded \${chatFilter === "bot" ? "bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/30" : "text-slate-400 hover:text-slate-200"}\`}>Bot Activo</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[#222e35]">
                {filteredChats.map((conv) => {
                  const isActive = selectedConvId === conv.id;
                  const isHuman = conv.status === "human";
                  
                  return (
                    <div key={conv.id} onClick={() => setSelectedConvId(conv.id)} className={\`p-3.5 cursor-pointer transition border-l-4 \${isActive ? (isHuman ? 'bg-[#202c33]/70 border-amber-500' : 'bg-[#202c33]/70 border-[#00a884]') : 'hover:bg-[#202c33]/50 border-transparent'}\`}>
                      <div className="flex items-start gap-3">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-[#202c33] flex items-center justify-center text-xl">👤</div>
                          <span className={\`absolute bottom-0 right-0 w-3 h-3 border-2 border-[#111b21] rounded-full \${isHuman ? 'bg-amber-500' : 'bg-[#00a884]'}\`}></span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-0.5">
                            <h3 className={\`text-sm font-semibold truncate \${isActive ? 'text-white' : 'text-slate-200'}\`}>{conv.pushName || conv.id}</h3>
                            <span className="text-[11px] text-slate-400">{new Date(conv.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mb-1">
                            {isHuman ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                                <i className="ph-fill ph-warning-circle text-[10px]"></i> Requiere Humano
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#00a884]/20 text-[#00a884]">
                                <i className="ph-fill ph-robot text-[10px]"></i> Bot Activo
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 truncate">{conv.id}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 3. ÁREA PRINCIPAL */}
            <main className="flex-1 bg-[#0b141a] flex flex-col justify-between relative overflow-hidden">
              {selectedConvId ? (
                <>
                  <header className="h-16 bg-[#202c33] px-6 border-b border-[#2a3942] flex items-center justify-between z-10 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#111b21] flex items-center justify-center text-xl">👤</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-bold text-white">{conversations.find(c => c.id === selectedConvId)?.pushName || selectedConvId}</h2>
                          <span className="text-xs text-[#00a884] font-medium">• En línea</span>
                        </div>
                        <p className="text-xs text-slate-400">{selectedConvId}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {conversations.find(c => c.id === selectedConvId)?.status === "bot" ? (
                        <button onClick={() => toggleStatus(selectedConvId, "human")} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-lg shadow-blue-900/40 transition">
                          <i className="ph-fill ph-pause-circle text-base"></i>
                          <span>Pausar Bot / Tomar Control Manual</span>
                        </button>
                      ) : (
                        <button onClick={() => toggleStatus(selectedConvId, "bot")} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-lg shadow-emerald-900/40 transition">
                          <i className="ph-fill ph-play-circle text-base"></i>
                          <span>Reactivar Bot Automático</span>
                        </button>
                      )}
                    </div>
                  </header>

                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.map((m, idx) => {
                      const isBot = m.role === "assistant";
                      
                      const btnRegex = /\\[BOTONES:\\s*(.+?)\\]/i;
                      const match = m.content.match(btnRegex);
                      let text = m.content;
                      let buttons = [];
                      if (match) {
                        text = m.content.replace(btnRegex, '').trim();
                        buttons = match[1].split('|').map(b => b.trim()).filter(b => b);
                      }

                      if (isBot) {
                        return (
                          <div key={idx} className="flex flex-col items-start max-w-md">
                            <div className="bg-[#202c33] text-slate-100 p-3.5 rounded-2xl rounded-tl-sm text-sm shadow-md border border-[#2a3942]">
                              <div className="flex items-center gap-1.5 text-xs text-[#00a884] font-semibold mb-1">
                                <i className="ph-fill ph-robot"></i> Agente
                              </div>
                              <p className="whitespace-pre-wrap">{text}</p>
                              <div className="text-[10px] text-slate-400 text-right mt-1">{new Date(m.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                            </div>
                            {buttons.length > 0 && (
                              <div className="w-full mt-1.5 space-y-1">
                                {buttons.map((b, i) => (
                                  <button key={i} className="w-full bg-[#1e293b] hover:bg-[#334155] text-slate-200 text-xs py-2 px-3 rounded-lg border border-[#334155] flex items-center justify-center gap-2 transition font-medium">
                                    <i className="ph ph-check-circle"></i> {b}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      } else {
                        return (
                          <div key={idx} className="flex flex-col items-end">
                            <div className="bg-[#005c4b] text-white p-3.5 rounded-2xl rounded-tr-sm text-sm shadow-md max-w-md">
                              <p className="whitespace-pre-wrap">{text}</p>
                              <div className="flex items-center justify-end gap-1 text-[10px] text-teal-200 mt-1">
                                <span>{new Date(m.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                <i className="ph-fill ph-checks text-teal-300"></i>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="p-4 bg-[#202c33] border-t border-[#2a3942] flex items-center gap-3 shrink-0">
                    <button className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-[#111b21] transition">
                      <i className="ph ph-paperclip text-xl"></i>
                    </button>
                    <input 
                      type="text" 
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                      placeholder="Escribe un mensaje como asesor humano (pausará el bot)..." 
                      className="flex-1 bg-[#111b21] text-sm text-white placeholder-slate-400 px-4 py-3 rounded-lg border border-[#2a3942] focus:border-[#00a884] focus:outline-none transition"
                    />
                    <button onClick={handleSendReply} className="bg-[#00a884] hover:bg-[#029070] text-[#111b21] font-bold p-3 rounded-lg shadow transition flex items-center justify-center">
                      <i className="ph-fill ph-paper-plane-tilt text-lg"></i>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500">
                  Selecciona un chat para comenzar
                </div>
              )}
            </main>

            {/* 4. DETALLES (Right Sidebar) */}
            {selectedConvId && (
              <aside className="w-72 bg-[#111b21] border-l border-[#222e35] p-5 flex flex-col justify-between shrink-0 overflow-y-auto">
                <div className="space-y-6">
                  <div className="text-center pb-4 border-b border-[#222e35]">
                    <div className="w-16 h-16 rounded-full bg-[#202c33] flex items-center justify-center text-3xl mx-auto mb-2 ring-2 ring-[#00a884]/40">👤</div>
                    <h3 className="font-bold text-white text-base">{conversations.find(c => c.id === selectedConvId)?.pushName || selectedConvId}</h3>
                    <p className="text-xs text-slate-400 font-mono">{selectedConvId}</p>
                    <span className="inline-block mt-2 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Activo
                    </span>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Etiquetas</label>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="bg-[#202c33] text-slate-300 text-xs px-2.5 py-1 rounded-md border border-[#2a3942]">Nuevo Cliente</span>
                      {conversations.find(c => c.id === selectedConvId)?.status === "human" && (
                        <span className="bg-amber-500/10 text-amber-300 text-xs px-2.5 py-1 rounded-md border border-amber-500/20">Requiere Humano</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Acciones Rápidas</label>
                    <div className="space-y-2">
                      <button onClick={() => toggleStatus(selectedConvId, "bot")} className="w-full flex items-center justify-center gap-2 bg-[#202c33] hover:bg-[#2a3942] text-emerald-400 text-xs py-2.5 rounded-lg border border-[#2a3942] transition font-medium">
                        <i className="ph ph-arrow-counter-clockwise text-base"></i> Reactivar Bot
                      </button>
                    </div>
                  </div>
                </div>
              </aside>
            )}
          </>
        )}

        {/* CONTENEDOR PARA OTRAS TABS */}
        {tab !== "chats" && (
          <main className="flex-1 overflow-y-auto p-8 bg-[#0b141a]">
            {tab === "orders" && renderOrdersTab()}
            {tab === "catalog" && renderCatalogTab()}
            {tab === "hours" && renderHoursTab()}
            {tab === "settings" && renderSettingsTab()}
            {tab === "qr" && renderQrModal()}
          </main>
        )}

      </div>
    </>
  );
`;

fs.writeFileSync('app/panel/page.tsx', beforeReturn + jsx + "\n}\n");
console.log("Successfully replaced the UI block!");
