const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

// The new sidebar structure:
const newSidebar = `
    <div className="crm-layout">
      {/* SIDEBAR */}
      <div className="crm-sidebar">
        <div className="crm-sidebar-logo">
          <span style={{ fontSize: "1.5rem" }}>📱</span>
          Ventas WhatsApp
        </div>
        
        <div className="crm-sidebar-nav">
          <button className={\`crm-sidebar-btn \${tab === "chats" ? "active" : ""}\`} onClick={() => setTab("chats")}>
            <span>💬</span> Chats en Vivo
          </button>
          <button className={\`crm-sidebar-btn \${tab === "orders" ? "active" : ""}\`} onClick={() => setTab("orders")}>
            <span>📦</span> Pedidos
          </button>
          <button className={\`crm-sidebar-btn \${tab === "catalog" ? "active" : ""}\`} onClick={() => setTab("catalog")}>
            <span>🍔</span> Menú / Catálogo
          </button>
          <button className={\`crm-sidebar-btn \${tab === "hours" ? "active" : ""}\`} onClick={() => setTab("hours")}>
            <span>🕒</span> Horarios
          </button>
          <button className={\`crm-sidebar-btn \${tab === "settings" ? "active" : ""}\`} onClick={() => setTab("settings")}>
            <span>🤖</span> Configuración IA
          </button>
        </div>

        <div style={{ padding: "1rem", marginTop: "auto" }}>
          <button onClick={() => setShowQrModal(true)} className="crm-sidebar-btn" style={{ width: "100%", justifyContent: "flex-start", marginBottom: "0.5rem" }}>
            <span>🔗</span> Vincular WhatsApp
          </button>
          <button onClick={handleLogout} className="crm-sidebar-btn" style={{ width: "100%", justifyContent: "flex-start", color: "#ef4444" }}>
            <span>🚪</span> Cerrar Sesión
          </button>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="crm-chats-container" style={{ display: tab === "chats" ? "flex" : "none" }}>
        {/* We will leave the chats implementation for the next step, for now just render the old chats grid inside a container */}
        <div className="crm-main-content" style={{ padding: "0" }}>
`;

// The old structure starts with:
// <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
//       <nav style={{ background: "var(--bg-card)"...
// until the start of main
code = code.replace(
  /<div style=\{\{ minHeight: "100vh", display: "flex", flexDirection: "column" \}\}>\s*<nav style=\{\{ background: "var\(--bg-card\)".*?<\/nav>\s*<main style=\{\{ flex: 1, padding: "1\.5rem", maxWidth: 1200, width: "100%", margin: "0 auto" \}\}>/s,
  newSidebar
);

// Close the crm-chats-container after the tab==="chats" content, and then render the other tabs
code = code.replace(
  /\{\/\* ========================================================= \*\/\}\s*\{\/\* TAB 2: PEDIDOS/,
  `</div>\n      </div>\n\n      {/* OTHER TABS */} \n      <div className="crm-main-content" style={{ display: tab !== "chats" ? "block" : "none" }}>\n        {/* ========================================================= */}\n        {/* TAB 2: PEDIDOS`
);

// At the end, replace </main> with the closing tags
code = code.replace(
  /<\/main>\s*\{\/\* ORDER DETAILS MODAL \*\/\}/s,
  `      </div>\n    </div>\n\n      {/* ORDER DETAILS MODAL */}`
);

fs.writeFileSync('app/panel/page.tsx', code);
