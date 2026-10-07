const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

// 1. Add CSS for mobile and modal
const styleInjection = `
      <style>{\`
        /* Mobile & Modal CSS */
        .chats-grid { display: grid; grid-template-columns: 350px 1fr; gap: 1.5rem; height: calc(100vh - 180px); }
        .mobile-modal-overlay {
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0,0,0,0.6); z-index: 1000;
          display: flex; align-items: center; justify-content: center;
        }
        .mobile-modal-content {
          background: var(--bg-card); padding: 2rem; border-radius: 12px; width: 500px;
          max-width: 95vw; max-height: 90vh; overflow-y: auto; border: 1px solid var(--border);
        }
        @media (max-width: 768px) {
          header { padding: 1rem !important; flex-wrap: wrap; gap: 0.5rem; }
          .chats-grid { grid-template-columns: 1fr; height: auto; }
          .mobile-hide { display: none !important; }
        }
      \`}</style>
`;
code = code.replace(
  '<div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)" }}>',
  '<div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)" }}>' + styleInjection
);

// 2. Change Chats grid
code = code.replace(
  '<div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: "1.5rem", height: "calc(100vh - 180px)" }}>',
  '<div className="chats-grid">'
);

// 3. Add Modal implementation at the bottom of the page before the last </div>
const modalCode = `
      {/* ORDER DETAILS MODAL */}
      {selectedOrderId && (
        <div className="mobile-modal-overlay" onClick={() => setSelectedOrderId(null)}>
          <div className="mobile-modal-content" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const order = orders.find(o => o.id === selectedOrderId);
              if (!order) return null;
              return (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Detalle de Pedido</h2>
                    <button onClick={() => setSelectedOrderId(null)} style={{ background: "none", border: "none", fontSize: "1.5rem", cursor: "pointer", color: "var(--text)" }}>×</button>
                  </div>
                  
                  <div style={{ marginBottom: "1rem" }}><strong>ID:</strong> {order.id}</div>
                  <div style={{ marginBottom: "1rem" }}><strong>Cliente:</strong> {order.customerName || "Desconocido"}</div>
                  <div style={{ marginBottom: "1rem" }}><strong>WhatsApp:</strong> {conversations.find(c => c.id === order.conversationId)?.phone || order.conversationId}</div>
                  <div style={{ marginBottom: "1rem" }}><strong>Dirección:</strong> {order.deliveryAddress || "Pendiente"}</div>
                  <div style={{ marginBottom: "1rem" }}><strong>Pago:</strong> {order.paymentMethod || "Pendiente"}</div>
                  <div style={{ marginBottom: "1rem" }}><strong>Fecha:</strong> {formatDate(order.createdAt).date} {formatDate(order.createdAt).time}</div>
                  <div style={{ marginBottom: "1rem" }}><strong>Total:</strong> <span style={{ color: "var(--primary)", fontWeight: "bold", fontSize: "1.2rem" }}>\${order.total.toLocaleString("es-CO")}</span></div>
                  
                  <div style={{ marginTop: "1.5rem", background: "rgba(255,255,255,0.05)", padding: "1rem", borderRadius: "8px" }}>
                    <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Resumen de Artículos</h3>
                    <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.9rem", color: "var(--text-muted)" }}>
                      {order.itemsSummary || "Sin detalles adicionales"}
                    </pre>
                  </div>

                  <div style={{ marginTop: "2rem", textAlign: "right" }}>
                    <button 
                      className="lp-btn" 
                      onClick={async () => {
                        if(confirm("¿Estás seguro de que quieres eliminar este pedido?")) {
                          await fetch(\`/api/panel/orders/\${order.id}\`, { method: 'DELETE' });
                          setSelectedOrderId(null);
                          loadOrders();
                        }
                      }}
                      style={{ background: "#ef4444", color: "white", padding: "0.75rem 1.5rem" }}
                    >
                      🗑️ Eliminar Pedido
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
`;

code = code.replace(/<\/div>\s*\)\;\s*\}\s*$/g, modalCode + '\n    </div>\n  );\n}\n');

fs.writeFileSync('app/panel/page.tsx', code);
console.log("Re-added Order Modal and Mobile CSS");
