const fs = require('fs');

let code = fs.readFileSync('app/panel/page.tsx', 'utf8');
const lines = code.split('\n');

const newChatsTab = `          {tab === "chats" && (
            <div style={{ display: "flex", height: "100%", width: "100%" }}>
              {/* Left Column: Chat List */}
              <div className="crm-chat-list-col">
                <div className="crm-chat-list-header">
                  <h2>Chats en Vivo</h2>
                  <input 
                    type="text" 
                    placeholder="Buscar contacto o número..." 
                    className="crm-search-bar" 
                    // To do: search implementation
                  />
                  <div className="crm-filters">
                    {(["all", "human", "bot", "closed"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={\`crm-filter-btn \${filter === f ? "active" : ""}\`}
                      >
                        {f === "all" ? "Todos" : f === "human" ? "Esperando Asesor" : f === "bot" ? "Bot Activo" : "Finalizado"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="crm-chat-items">
                  {filteredConversations.length === 0 ? (
                    <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                      No hay conversaciones.
                    </div>
                  ) : (
                    filteredConversations.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setSelectedConvId(c.id)}
                        className={\`crm-chat-item \${selectedConvId === c.id ? "active" : ""}\`}
                      >
                        <div className="crm-chat-item-avatar">
                          👤
                          <div className={\`crm-status-dot \${c.status === "human" ? "online" : "offline"}\`}></div>
                        </div>
                        <div className="crm-chat-item-details">
                          <div className="crm-chat-item-header">
                            <span className="crm-chat-item-name">{c.phone}</span>
                          </div>
                          <div className="crm-chat-item-msg">
                            Click para ver mensajes
                          </div>
                          <span className={\`crm-tag \${c.status}\`}>
                            {c.status === "human" ? "⚠️ Requiere Humano" : c.status === "bot" ? "🤖 Bot Activo" : "Finalizado"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Middle Column: Chat View */}
              <div className="crm-chat-main">
                {selectedConvId ? (
                  <>
                    <div className="crm-chat-main-header">
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                        <div className="crm-chat-item-avatar">👤</div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#f3f4f6" }}>{selectedConvId}</h3>
                          <span style={{ fontSize: "0.8rem", color: "#10b981" }}>En línea</span>
                        </div>
                      </div>
                      <button
                        onClick={handleToggleStatus}
                        className={\`crm-control-btn \${
                          filteredConversations.find(c => c.id === selectedConvId)?.status === "bot" ? "" : "active"
                        }\`}
                      >
                        {filteredConversations.find(c => c.id === selectedConvId)?.status === "bot" 
                          ? "⏸ Pausar Bot / Tomar Control Manual" 
                          : "▶ Reanudar Bot"}
                      </button>
                    </div>

                    <div className="crm-chat-messages">
                      {messages.map((m, idx) => {
                        const isSystem = m.role === "system";
                        if (isSystem) {
                          return (
                            <div key={idx} className="crm-system-msg">
                              ⚠️ Regla activada: {m.content}
                            </div>
                          );
                        }
                        const isBot = m.role === "assistant";
                        return (
                          <div key={idx} className={\`crm-bubble-wrapper \${isBot ? "bot" : "human"}\`}>
                            <div className="crm-bubble">
                              {m.content}
                              {/* TODO: Render Interactive buttons here if any */}
                            </div>
                            <div className="crm-bubble-meta">
                              {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    <div className="crm-chat-input-area">
                      <div className="crm-chat-input-wrapper">
                        <input
                          type="text"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendReply();
                            }
                          }}
                          placeholder="Escribe un mensaje como asesor..."
                        />
                        <button className="send" onClick={handleSendReply}>
                          ▶
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
                    Selecciona una conversación
                  </div>
                )}
              </div>

              {/* Right Column: Contact Details */}
              <div className="crm-details-col">
                {selectedConvId ? (
                  <>
                    <div className="crm-details-section">
                      <h3>Detalles del Contacto</h3>
                      <div className="crm-contact-profile">
                        <div className="crm-contact-profile-avatar">👤</div>
                        <div className="crm-contact-profile-info">
                          <h4>{selectedConvId}</h4>
                          <p>{selectedConvId}</p>
                        </div>
                      </div>
                      <div className="crm-detail-row">
                        <strong>Origen:</strong> Ingresó por WhatsApp
                      </div>
                    </div>

                    <div className="crm-details-section">
                      <h3>Etiquetas</h3>
                      <div className="crm-tags-list">
                        <span className="crm-detail-tag">Cliente Nuevo</span>
                        <span className="crm-detail-tag">Soporte</span>
                        <button className="crm-detail-tag add">+ Añadir etiqueta</button>
                      </div>
                    </div>

                    <div className="crm-details-section">
                      <h3>Acciones Rápidas</h3>
                      <div className="crm-quick-actions">
                        <button className="crm-action-btn">👤 Asignar a Asesor</button>
                        <button className="crm-action-btn">📩 Enviar Plantilla HSM</button>
                        <button className="crm-action-btn" onClick={handleToggleStatus}>🔄 Reiniciar Bot</button>
                        <button className="crm-action-btn">📝 Notas Internas</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ color: "#9ca3af", textAlign: "center", marginTop: "2rem", fontSize: "0.9rem" }}>
                    Selecciona una conversación para ver los detalles.
                  </div>
                )}
              </div>
            </div>
          )}
`;

let startIdx = lines.findIndex(l => l.includes('          {tab === "chats" && ('));
let endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('          </div>') && lines[i+1].includes('        )}') && lines[i+2].includes('        {/* ========================================================= */}'));

// Just to be safe, replace lines from startIdx to endIdx+1
if (startIdx !== -1 && endIdx !== -1) {
  lines.splice(startIdx, endIdx - startIdx + 2, newChatsTab);
  fs.writeFileSync('app/panel/page.tsx', lines.join('\n'));
  console.log('REPLACED CHATS TAB SUCCESSFULLY');
} else {
  console.log('COULD NOT FIND TAB CHATS', startIdx, endIdx);
}
