const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

const startIndex = code.indexOf('<div style={{ minHeight: "100vh"');
const mainIndex = code.indexOf('<main style={{ flex: 1, padding: "1.5rem", maxWidth: 1200, width: "100%", margin: "0 auto" }}>');

if (startIndex !== -1 && mainIndex !== -1) {
  const toReplace = code.substring(startIndex, mainIndex + '<main style={{ flex: 1, padding: "1.5rem", maxWidth: 1200, width: "100%", margin: "0 auto" }}>'.length);
  
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
      <div className="crm-chats-container" style={{ display: tab === "chats" ? "flex" : "none", width: "100%" }}>
        <div className="crm-main-content" style={{ padding: "0" }}>
  `;
  
  code = code.replace(toReplace, newSidebar);
  fs.writeFileSync('app/panel/page.tsx', code);
  console.log('REPLACED SUCCESSFULLY');
} else {
  console.log('COULD NOT FIND INDICES');
}
