const fs = require('fs');
const code = fs.readFileSync('app/panel/page.tsx', 'utf8');
const lines = code.split('\n');

const qrTabLines = lines.slice(567, 796); 
// Index 567 is line 568: {/* TAB: WHATSAPP WEB STYLE QR CODE ... */}
// Index 569 is line 570: {tab === "whatsapp_qr" && (
// Index 794 is line 795: )}

let qrModalContent = qrTabLines.join('\n');
qrModalContent = qrModalContent.replace(
  '{tab === "whatsapp_qr" && (',
  `{showQrModal && (
  <div className="mobile-modal-overlay" onClick={() => setShowQrModal(false)}>
    <div className="mobile-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 960, margin: "1rem auto", width: "95vw", padding: 0 }}>`
);

// Add the modal header inside the QR block
qrModalContent = qrModalContent.replace(
  /<div style=\{\{ maxWidth: 960, margin: "1rem auto" \}\}>\s*\{\/\* WhatsApp Web Banner Header \*\/\}\s*<div style=\{\{ background: "#00a884"[^\>]+>/,
  `<div style={{ background: "#00a884", borderRadius: "12px 12px 0 0", padding: "1.25rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
      <div style={{ color: "white", fontSize: "1.5rem" }}>📱</div>
      <div>
        <h2 style={{ fontSize: "1.1rem", margin: 0, color: "white", fontWeight: 600 }}>
          Vincular WhatsApp
        </h2>
      </div>
    </div>
    <button onClick={() => setShowQrModal(false)} style={{ background: "transparent", border: "none", color: "white", fontSize: "2rem", cursor: "pointer", lineHeight: 1 }}>&times;</button>
  </div>`
);

// We still have `          </div>\n        </div>\n      )}` at the end
qrModalContent = qrModalContent.replace(
  /<\/div>\s*<\/div>\s*\)\}/,
  '</div>\n</div>\n</div>\n)}'
);

// Now, replace lines 567 to 795 in the original file with EMPTY string, and append qrModalContent at the bottom before </main>
let newLines = [...lines];
newLines.splice(567, 796 - 567);

const finalCode = newLines.join('\n');
const insertPos = finalCode.lastIndexOf('</main>');

const finalFinalCode = finalCode.substring(0, insertPos) + qrModalContent + '\n' + finalCode.substring(insertPos);

fs.writeFileSync('app/panel/page.tsx', finalFinalCode);
