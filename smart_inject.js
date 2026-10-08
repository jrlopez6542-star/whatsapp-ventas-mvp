const fs = require('fs');

const content = fs.readFileSync('app/panel/page.tsx', 'utf8');

// Find the return before it
const searchStr = '<div className="crm-layout">';
let returnIdx = content.lastIndexOf(searchStr);
const realReturnIdx = content.lastIndexOf('return (', returnIdx);

if (realReturnIdx === -1) {
    console.log("Return not found");
    process.exit(1);
}

const beforeReturn = content.substring(0, realReturnIdx);

const newJsx = `  return (
    <>
      <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
      <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />
      <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css" />
      <style>{\`
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #475569; }
        input:focus { outline: none; }
      \`}</style>
      
      <div className="bg-[#0b141a] text-slate-300 font-sans antialiased h-screen w-screen overflow-hidden flex select-none text-[13px]">
        
        {/* 1. BARRA LATERAL IZQUIERDA (NAVEGACIÓN) */}
        <aside className="w-[220px] bg-[#121b22] border-r border-[#1f2c34] flex flex-col justify-between shrink-0">
          <div>
            {/* Header / Logo */}
            <div className="h-16 flex items-center gap-3 px-4">
              <div className="text-[#25D366] text-3xl">
                <i className="ph-fill ph-whatsapp-logo"></i>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#25D366] font-medium">
                <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse"></span>
                API Conectada
              </div>
            </div>

            <nav className="px-2 mt-2 space-y-1 text-[13px] font-medium text-slate-400">
              <button onClick={() => setTab("orders")} className={\`w-full flex items-center gap-3 px-3 py-2 rounded-md transition \${tab==='orders' ? 'bg-[#202c33] text-white' : 'hover:bg-[#202c33] hover:text-white'}\`}>
                <i className="ph ph-squares-four text-lg"></i> Dashboard
              </button>
              <button onClick={() => setTab("chats")} className={\`w-full flex items-center justify-between px-3 py-2 rounded-md transition \${tab==='chats' ? 'bg-[#202c33] text-white' : 'hover:bg-[#202c33] hover:text-white'}\`}>
                <div className="flex items-center gap-3">
                  <i className="ph ph-chat-circle-dots text-lg"></i> Chats en vivo
                </div>
                <span className="bg-[#007aff] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{conversations.length}</span>
              </button>
              <button onClick={() => setTab("catalog")} className={\`w-full flex items-center gap-3 px-3 py-2 rounded-md transition \${tab==='catalog' ? 'bg-[#202c33] text-white' : 'hover:bg-[#202c33] hover:text-white'}\`}>
                <i className="ph ph-robot text-lg"></i> Bots (Flujos)
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition text-slate-400 hover:bg-[#202c33] hover:text-white">
                <i className="ph ph-article text-lg"></i> Plantillas
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition text-slate-400 hover:bg-[#202c33] hover:text-white">
                <i className="ph ph-users text-lg"></i> Contactos
              </button>
              <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition text-slate-400 hover:bg-[#202c33] hover:text-white">
                <i className="ph ph-chart-line-up text-lg"></i> Analíticas
              </button>
              <button onClick={() => setTab("settings")} className={\`w-full flex items-center gap-3 px-3 py-2 rounded-md transition \${tab==='settings' ? 'bg-[#202c33] text-white' : 'hover:bg-[#202c33] hover:text-white'}\`}>
                <i className="ph ph-gear text-lg"></i> Configuración
              </button>
            </nav>
          </div>

          <div className="p-2 space-y-1">
            <button onClick={() => setShowQrModal(true)} className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition text-slate-400 hover:bg-[#202c33] hover:text-white">
              <i className="ph ph-qr-code text-lg"></i> Vincular WhatsApp
            </button>
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition text-[#ef4444] hover:bg-[#ef4444]/10">
              <i className="ph ph-sign-out text-lg"></i> Cerrar Sesión
            </button>
          </div>
        </aside>

        {tab === "chats" && (
          <>
            {/* 2. BANDEJA DE CHATS */}
            <section className="w-[340px] bg-[#111b21] border-r border-[#1f2c34] flex flex-col shrink-0">
              <div className="p-4 pb-2 border-b border-[#1f2c34]">
                <h2 className="text-xl font-bold text-white mb-4">Chats en Vivo</h2>
                <div className="relative mb-4">
                  <i className="ph ph-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-base"></i>
                  <input 
                    type="text" 
                    placeholder="Buscar conversación..." 
                    className="w-full bg-[#202c33] text-sm text-white placeholder-slate-400 pl-9 pr-3 py-2 rounded-lg border border-transparent focus:border-[#1f2c34] transition"
                  />
                </div>

                <div className="flex gap-4 text-[13px] font-medium border-b border-[#1f2c34]">
                  <button onClick={() => setFilter("all")} className={\`pb-2 \${filter === "all" ? "text-[#007aff] border-b-2 border-[#007aff]" : "text-slate-400 hover:text-slate-200"}\`}>Todos</button>
                  <button onClick={() => setFilter("human")} className={\`pb-2 \${filter === "human" ? "text-[#007aff] border-b-2 border-[#007aff]" : "text-slate-400 hover:text-slate-200"}\`}>Esperando Asesor</button>
                  <button onClick={() => setFilter("bot")} className={\`pb-2 \${filter === "bot" ? "text-[#007aff] border-b-2 border-[#007aff]" : "text-slate-400 hover:text-slate-200"}\`}>Bot Activo</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {filteredConversations.map((conv) => {
                  const isActive = selectedConvId === conv.id;
                  const isHuman = conv.status === "human";
                  const isClosed = conv.status === "closed";
                  const formatPhoneLocal = (p) => p ? p.replace(/[^0-9]/g, '').slice(-10) : '';
                  
                  return (
                    <div key={conv.id} onClick={() => setSelectedConvId(conv.id)} className={\`px-4 py-3 cursor-pointer transition border-b border-[#1f2c34] \${isActive ? 'bg-[#202c33]' : 'hover:bg-[#202c33]/50'}\`}>
                      <div className="flex items-start gap-3">
                        <div className="relative shrink-0">
                          <img src={\`https://api.dicebear.com/7.x/initials/svg?seed=\${conv.phone || conv.id}&backgroundColor=202c33&textColor=ffffff\`} className="w-12 h-12 rounded-full object-cover border border-[#1f2c34]" alt="" />
                          {isHuman && <span className="absolute bottom-0 right-0 w-4 h-4 bg-[#f59e0b] border-2 border-[#111b21] rounded-full flex items-center justify-center"><i className="ph-fill ph-warning text-[10px] text-white"></i></span>}
                          {!isHuman && !isClosed && <span className="absolute bottom-0 right-0 w-4 h-4 bg-[#22c55e] border-2 border-[#111b21] rounded-full flex items-center justify-center"><i className="ph-fill ph-check text-[10px] text-white"></i></span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1">
                            <h3 className="text-[15px] font-semibold text-white truncate">{conv.pushName || formatPhoneLocal(conv.phone) || formatPhoneLocal(conv.id)}</h3>
                            <span className="text-xs text-slate-400">{new Date(conv.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-xs text-slate-400 font-mono">{formatPhoneLocal(conv.phone) || formatPhoneLocal(conv.id)}</span>
                          </div>

                          <div className="flex items-center gap-2 mb-1">
                            {isHuman && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20">
                                <i className="ph-fill ph-warning"></i> Requiere Humano
                              </span>
                            )}
                            {!isHuman && !isClosed && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20">
                                <i className="ph-fill ph-robot"></i> Bot Activo
                              </span>
                            )}
                            {isClosed && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#64748b]/20 text-[#cbd5e1] border border-[#64748b]/30">
                                <i className="ph ph-check"></i> Finalizado
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-slate-400 truncate">Conversación activa</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 3. ÁREA PRINCIPAL */}
            <main className="flex-1 bg-[#0b141a] flex flex-col justify-between relative overflow-hidden" style={{backgroundImage: "url('https://whatsapp-ventas-mvp.vercel.app/bg-chat.png')", backgroundSize: 'cover', backgroundBlendMode: 'overlay', backgroundColor: 'rgba(11,20,26,0.95)'}}>
              {selectedConvId ? (
                <>
                  <header className="h-16 bg-[#121b22] px-6 flex items-center justify-between z-10 shrink-0 border-b border-[#1f2c34]">
                    <div className="flex items-center gap-3">
                      <div>
                        <h2 className="text-[16px] font-bold text-white leading-tight">{conversations.find(c => c.id === selectedConvId)?.pushName || selectedConvId.replace(/[^0-9]/g, '').slice(-10)}</h2>
                        <p className="text-xs text-slate-400">{selectedConvId.replace(/[^0-9]/g, '').slice(-10)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {conversations.find(c => c.id === selectedConvId)?.status === "bot" ? (
                        <button onClick={() => handleToggleBot(selectedConvId, "human")} className="flex items-center gap-2 bg-[#007aff] hover:bg-[#005bb5] text-white font-semibold text-sm px-4 py-2 rounded-lg shadow-sm transition">
                          <i className="ph-fill ph-pause"></i>
                          <span>Pausar Bot / Tomar Control Manual</span>
                        </button>
                      ) : (
                        <button onClick={() => handleToggleBot(selectedConvId, "bot")} className="flex items-center gap-2 bg-[#007aff] hover:bg-[#005bb5] text-white font-semibold text-sm px-4 py-2 rounded-lg shadow-sm transition">
                          <i className="ph-fill ph-play"></i>
                          <span>Reactivar Bot Automático</span>
                        </button>
                      )}
                      <button onClick={() => handleToggleBot(selectedConvId, "closed")} className="flex items-center gap-2 text-slate-300 hover:text-white px-3 py-2 text-sm rounded-lg border border-[#2a3942] hover:bg-[#202c33] transition">
                        <i className="ph ph-x"></i> Cerrar Caso
                      </button>
                    </div>
                  </header>

                  <div className="flex-1 overflow-y-auto p-6 space-y-3">
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
                          <div key={idx} className="flex flex-col items-start w-full">
                            <div className="bg-[#202c33] text-slate-200 p-3 rounded-lg rounded-tl-none text-[14.5px] max-w-md shadow-sm border border-transparent">
                              <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
                              <div className="text-[11px] text-slate-400 text-right mt-1">{new Date(m.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                            </div>
                            {buttons.length > 0 && (
                              <div className="w-full max-w-md mt-1 space-y-1">
                                {buttons.map((b, i) => (
                                  <div key={i} className="w-full bg-[#202c33] hover:bg-[#2a3942] text-[#00a884] text-[14.5px] py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer shadow-sm">
                                    {b}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      } else {
                        return (
                          <div key={idx} className="flex flex-col items-end w-full">
                            <div className="bg-[#005c4b] text-white p-3 rounded-lg rounded-tr-none text-[14.5px] max-w-md shadow-sm">
                              <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
                              <div className="flex items-center justify-end gap-1 text-[11px] text-teal-100/70 mt-1">
                                <span>{new Date(m.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                <i className="ph-fill ph-checks text-[#53bdeb] text-sm"></i>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="p-3 bg-[#121b22] flex items-center gap-3 shrink-0 border-t border-[#1f2c34]">
                    <button className="text-slate-400 hover:text-white p-2 rounded-lg transition">
                      <i className="ph ph-paperclip text-[22px]"></i>
                    </button>
                    <input 
                      type="text" 
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                      placeholder="Escribe un mensaje como asesor..." 
                      className="flex-1 bg-[#202c33] text-[15px] text-white placeholder-slate-400 px-4 py-3 rounded-lg border-none focus:ring-0 transition"
                    />
                    <button onClick={handleSendReply} className="bg-[#202c33] hover:bg-[#2a3942] text-slate-300 p-3 rounded-lg transition flex items-center justify-center">
                      <i className="ph-fill ph-paper-plane-tilt text-xl"></i>
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
              <aside className="w-[280px] bg-[#121b22] border-l border-[#1f2c34] flex flex-col shrink-0 overflow-y-auto">
                
                <div className="p-5 border-b border-[#1f2c34]">
                  <h3 className="font-bold text-white text-base mb-4">Detalles del Contacto</h3>
                  <div className="mb-4">
                    <h4 className="font-semibold text-slate-200 text-sm">{conversations.find(c => c.id === selectedConvId)?.pushName || selectedConvId.replace(/[^0-9]/g, '').slice(-10)}</h4>
                    <p className="text-xs text-slate-400 mt-1">{selectedConvId.replace(/[^0-9]/g, '').slice(-10)}</p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-[#007aff] bg-[#007aff]/10 px-2 py-1 rounded border border-[#007aff]/20 font-medium">[Cliente Nuevo]</span>
                    {conversations.find(c => c.id === selectedConvId)?.status === "human" && (
                      <span className="text-xs text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-1 rounded border border-[#f59e0b]/20 font-medium">[Prioridad]</span>
                    )}
                  </div>
                </div>

                <div className="p-5 border-b border-[#1f2c34]">
                  <h3 className="font-bold text-white text-base mb-3">Historial del flujo</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Flujo actual: <span className="text-slate-400">Menú Principal</span>
                    {conversations.find(c => c.id === selectedConvId)?.status === "human" && (
                      <span className="text-slate-400"> (Interrumpido)</span>
                    )}
                  </p>
                </div>

                <div className="p-5">
                  <h3 className="font-bold text-white text-base mb-4">Acciones Rápidas</h3>
                  <div className="space-y-3">
                    <button className="w-full flex items-center justify-center gap-2 bg-[#202c33] hover:bg-[#2a3942] text-slate-200 text-sm py-2 rounded-lg border border-[#2a3942] transition">
                      <i className="ph-fill ph-user"></i> Asignar a Asesor
                    </button>
                    <button className="w-full flex items-center justify-center gap-2 bg-[#202c33] hover:bg-[#2a3942] text-slate-200 text-sm py-2 rounded-lg border border-[#2a3942] transition">
                      <i className="ph-fill ph-envelope"></i> Enviar Plantilla HSM
                    </button>
                    <button onClick={() => handleToggleBot(selectedConvId, "bot")} className="w-full flex items-center justify-center gap-2 bg-[#202c33] hover:bg-[#2a3942] text-slate-200 text-sm py-2 rounded-lg border border-[#2a3942] transition">
                      <i className="ph-fill ph-arrows-clockwise"></i> Reiniciar Bot
                    </button>
                  </div>
                </div>

              </aside>
            )}
          </>
        )}

        {/* CONTENEDOR PARA OTRAS TABS */}
        {tab !== "chats" && (
          <main className="flex-1 overflow-y-auto p-8 bg-[#0b141a]">
            {tab === "orders" && <div className="text-white p-4">Pedidos - En desarrollo</div>}
            {tab === "catalog" && <div className="text-white p-4">Catálogo - En desarrollo</div>}
            {tab === "settings" && <div className="text-white p-4">Configuración - En desarrollo</div>}
            {tab === "hours" && <div className="text-white p-4">Horarios - En desarrollo</div>}
            {tab === "qr" && <div className="text-white p-4">QR / Vincular - En desarrollo</div>}
          </main>
        )}

      </div>
    </>
  );
`;

const newContent = beforeReturn + newJsx + "\\n}\\n";

fs.writeFileSync('app/panel/page.tsx', newContent);
console.log("Injected exact UI successfully with no regex!");
