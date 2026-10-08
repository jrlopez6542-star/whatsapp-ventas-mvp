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

// 3. Replace the start of the QR tab to be a modal
code = code.replace(
  /\{tab === "whatsapp_qr" && \(\s*<div style=\{\{ maxWidth: 960, margin: "1rem auto" \}\}>\s*\{\/\* WhatsApp Web Banner Header \*\/\}\s*<div style=\{\{ background: "#00a884", borderRadius: "16px 16px 0 0", padding: "1.25rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" \}\}>/,
  `{showQrModal && (
          <div className="mobile-modal-overlay" onClick={() => setShowQrModal(false)}>
            <div className="mobile-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 960, margin: "1rem auto", width: "95vw", padding: 0 }}>
              <div style={{ background: "#00a884", borderRadius: "12px 12px 0 0", padding: "1.25rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>`
);

// 4. Add the Close button to the header right after the Instance select
code = code.replace(
  /<\/select>\s*<\/div>\s*<\/div>/,
  `</select>
                </div>
                <button onClick={() => setShowQrModal(false)} style={{ background: "transparent", border: "none", color: "white", fontSize: "2rem", cursor: "pointer", marginLeft: "1rem", lineHeight: 1 }}>&times;</button>
              </div>`
);

// 5. Add the closing tags for the modal overlay and content
// We need to find the end of the QR block, which is right before:
//         {/* ========================================================= */}
//         {/* TAB: CHATS                                   */}
code = code.replace(
  /<\/div>\s*\)\}\s*\{\/\* ========================================================= \*\/\}\s*\{\/\* TAB 1: BANDEJA DE CHATS/,
  `</div>\n</div>\n</div>\n)}\n        {/* ========================================================= */}\n        {/* TAB 1: BANDEJA DE CHATS`
);

fs.writeFileSync('app/panel/page.tsx', code);
