const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

// 1. Add showQrModal state
code = code.replace(
  'const [menuOpen, setMenuOpen] = useState(false);',
  'const [menuOpen, setMenuOpen] = useState(false);\n  const [showQrModal, setShowQrModal] = useState(false);'
);

// 2. Change dropdown menu item
code = code.replace(
  'setTab("whatsapp_qr"); setMenuOpen(false);',
  'setShowQrModal(true); setMenuOpen(false);'
);

// 3. Add Advanced Prompts
const additionalFields = `
                </div>
                <div style={{ marginTop: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    Personalización Avanzada de IA (Prompt Extra)
                  </label>
                  <textarea
                    rows={4}
                    value={settings.extraPrompt || ""}
                    onChange={(e) => setSettings({ ...settings, extraPrompt: e.target.value })}
                    placeholder="Instrucciones adicionales para inyectar en el prompt base de Gemini..."
                    style={{ width: "100%", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  />
                  <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>Estas instrucciones se concatenan al final del prompt base y te permiten modificar el comportamiento y formato de la IA.</p>
                </div>
                <div style={{ marginTop: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                    Objetivo Principal del Bot
                  </label>
                  <input
                    type="text"
                    value={settings.botObjective || ""}
                    onChange={(e) => setSettings({ ...settings, botObjective: e.target.value })}
                    placeholder="Ej: Vender la mayor cantidad de buñuelos posibles y ser muy amable."
                    style={{ width: "100%", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  />
`;

code = code.replace(
  /onChange=\{\(e\) => setSettings\(\{ \.\.\.settings, rules: e\.target\.value \}\)\}\s*style=\{\{.*?\}\}\s*\/>\s*<\/div>/s,
  match => match + additionalFields
);

// 4. Extract QR component into a modal
const qrTabRegex = /\{\/\* ========================================================= \*\/\}\s*\{\/\* TAB: WHATSAPP WEB STYLE QR CODE\s*\*\/\}\s*\{\/\* ========================================================= \*\/\}\s*\{tab === "whatsapp_qr" && \(\s*<div style=\{\{ maxWidth: 960, margin: "1rem auto" \}\}>\s*\{\/\* WhatsApp Web Banner Header \*\/\}\s*<div style=\{\{ background: "#00a884".*?<\/div>\s*<\/div>/s;

const modalOpen = `{/* ========================================================= */}
          {/* MODAL: WHATSAPP WEB STYLE QR CODE                         */}
          {/* ========================================================= */}
          {showQrModal && (
            <div className="mobile-modal-overlay" onClick={() => setShowQrModal(false)}>
              <div className="mobile-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 960, margin: "1rem auto", width: "95vw", padding: 0 }}>
                {/* WhatsApp Web Banner Header */}
                <div style={{ background: "#00a884", borderRadius: "12px 12px 0 0", padding: "1.25rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div style={{ color: "white", fontSize: "1.5rem" }}>📱</div>
                    <div>
                      <h2 style={{ fontSize: "1.1rem", margin: 0, color: "white", fontWeight: 600 }}>
                        Vincular WhatsApp
                      </h2>
                    </div>
                  </div>
                  <button onClick={() => setShowQrModal(false)} style={{ background: "transparent", border: "none", color: "white", fontSize: "1.5rem", cursor: "pointer" }}>×</button>
                </div>`;

code = code.replace(qrTabRegex, modalOpen);

// The end of the QR block is before 'TAB: CHATS'
code = code.replace(
  /<\/div>\s*\)\}\s*\{\/\* ========================================================= \*\/\}\s*\{\/\* TAB: CHATS/s,
  '</div></div></div>\n)} {/* ========================================================= */} {/* TAB: CHATS'
);

fs.writeFileSync('app/panel/page.tsx', code);
