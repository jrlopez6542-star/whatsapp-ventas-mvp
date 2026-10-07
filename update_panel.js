const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

// 1. Add menuOpen state and hours tab to type
code = code.replace(
  'const [tab, setTab] = useState<"whatsapp_qr" | "chats" | "orders" | "catalog" | "settings">("whatsapp_qr");',
  'const [tab, setTab] = useState<"whatsapp_qr" | "chats" | "orders" | "catalog" | "settings" | "hours">("orders");\n  const [menuOpen, setMenuOpen] = useState(false);'
);

// 2. Add business hours to initial settings state
code = code.replace(
  'welcomeMessage: "", rules: "" });',
  'welcomeMessage: "", rules: "", businessHoursEnabled: "false", businessHoursStart: "08:00", businessHoursEnd: "20:00", outOfHoursMessage: "" });'
);

// 3. Add Settings gear to header and remove logout button from header right side
const headerTarget = `<div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button onClick={handleLogout} className="ghost" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.9rem" }}>
            Cerrar Sesin
          </button>
        </div>`;
const newHeaderRight = `<div style={{ display: "flex", alignItems: "center", gap: "1rem", position: "relative" }}>
          <button onClick={() => setMenuOpen(!menuOpen)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.5rem" }}>
            ⚙️
          </button>
          {menuOpen && (
            <div style={{ position: "absolute", top: "100%", right: 0, marginTop: "0.5rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", padding: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem", zIndex: 50, minWidth: "200px" }}>
              <button onClick={() => { setTab("whatsapp_qr"); setMenuOpen(false); }} style={{ background: "transparent", border: "none", textAlign: "left", padding: "0.5rem 1rem", cursor: "pointer", color: "var(--text)", width: "100%", borderRadius: "4px" }}>📱 Vincular WhatsApp</button>
              <button onClick={() => { setTab("settings"); setMenuOpen(false); }} style={{ background: "transparent", border: "none", textAlign: "left", padding: "0.5rem 1rem", cursor: "pointer", color: "var(--text)", width: "100%", borderRadius: "4px" }}>🤖 Configuración IA</button>
              <button onClick={() => { setTab("hours"); setMenuOpen(false); }} style={{ background: "transparent", border: "none", textAlign: "left", padding: "0.5rem 1rem", cursor: "pointer", color: "var(--text)", width: "100%", borderRadius: "4px" }}>🕒 Horarios</button>
              <hr style={{ borderColor: "var(--border)", margin: "0.25rem 0" }} />
              <button onClick={handleLogout} style={{ background: "transparent", border: "none", textAlign: "left", padding: "0.5rem 1rem", cursor: "pointer", color: "#ef4444", width: "100%", borderRadius: "4px" }}>🚪 Cerrar Sesión</button>
            </div>
          )}
        </div>`;
code = code.replace(headerTarget, newHeaderRight);

// If the above didn't match (due to encoding), let's use regex
if (code === fs.readFileSync('app/panel/page.tsx', 'utf8')) {
  const hrRegex = /<div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>\s*<button onClick={handleLogout}.*?<\/button>\s*<\/div>/is;
  code = code.replace(hrRegex, newHeaderRight);
}

// 4. Update the horizontal tabs to ONLY show chats, orders, catalog
const tabsTarget = /\{\[\s*\{\s*id:\s*"whatsapp_qr"[\s\S]*?\].map\(\(t\) => \(/;
const newTabs = `{[
          { id: "orders", label: "📦 Pedidos" },
          { id: "chats", label: "💬 Bandeja de Entrada" },
          { id: "catalog", label: "🏷️ Catálogo" },
        ].map((t) => (`;
code = code.replace(tabsTarget, newTabs);

// 5. Add the Hours tab UI at the very end before the </main>
const hoursTab = `
        {/* ========================================================= */}
        {/* TAB 5: HORARIOS                                           */}
        {/* ========================================================= */}
        {tab === "hours" && (
          <div style={{ maxWidth: 700, margin: "0 auto", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "2rem" }}>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>🕒 Horario de Atención</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              Define cuándo la IA debe atender. Fuera de este horario, se enviará el mensaje automático.
            </p>
            {saveSuccess && (
              <div style={{ padding: "0.75rem", background: "rgba(37,211,102,0.2)", color: "var(--primary)", borderRadius: 6, marginBottom: "1rem" }}>
                Configuración guardada exitosamente.
              </div>
            )}
            <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "rgba(56,189,248,0.1)", padding: "1rem", borderRadius: "8px", border: "1px solid rgba(56,189,248,0.3)" }}>
                <input
                  type="checkbox"
                  id="businessHoursEnabled"
                  checked={settings.businessHoursEnabled === "true"}
                  onChange={(e) => setSettings({ ...settings, businessHoursEnabled: e.target.checked ? "true" : "false" })}
                  style={{ transform: "scale(1.2)" }}
                />
                <label htmlFor="businessHoursEnabled" style={{ fontWeight: 600, cursor: "pointer" }}>Habilitar Horario de Atención</label>
              </div>

              {settings.businessHoursEnabled === "true" && (
                <>
                  <div style={{ display: "flex", gap: "1rem" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>Hora de Apertura</label>
                      <input
                        type="time"
                        value={settings.businessHoursStart || "08:00"}
                        onChange={(e) => setSettings({ ...settings, businessHoursStart: e.target.value })}
                        style={{ width: "100%", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>Hora de Cierre</label>
                      <input
                        type="time"
                        value={settings.businessHoursEnd || "20:00"}
                        onChange={(e) => setSettings({ ...settings, businessHoursEnd: e.target.value })}
                        style={{ width: "100%", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>Mensaje de Cerrado (Fuera de Horario)</label>
                    <textarea
                      rows={3}
                      value={settings.outOfHoursMessage || ""}
                      onChange={(e) => setSettings({ ...settings, outOfHoursMessage: e.target.value })}
                      placeholder="¡Hola! En este momento nos encontramos cerrados..."
                      style={{ width: "100%", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                    />
                  </div>
                </>
              )}
              <button type="submit" disabled={savingSettings} className="lp-btn lp-btn-primary" style={{ alignSelf: "flex-start" }}>
                {savingSettings ? "Guardando..." : "Guardar Cambios"}
              </button>
            </form>
          </div>
        )}
`;
code = code.replace(/<\/main>/, hoursTab + '\n      </main>');

fs.writeFileSync('app/panel/page.tsx', code);
console.log("Updated app/panel/page.tsx");
