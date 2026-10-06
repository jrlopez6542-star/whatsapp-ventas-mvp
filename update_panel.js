const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

// Add selectedOrderId state
code = code.replace(
  'const [selectedConvId, setSelectedConvId] = useState<string | null>(null);',
  'const [selectedConvId, setSelectedConvId] = useState<string | null>(null);\n  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);'
);

// Add row onClick for orders
code = code.replace(
  '<tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>',
  '<tr key={o.id} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => setSelectedOrderId(o.id)}>'
);

// Add modal logic
const modalCode = `
      {/* Order Details Modal */}
      {selectedOrderId && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyItems: "center" }} onClick={() => setSelectedOrderId(null)}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "2rem", width: 500, maxWidth: "90%", margin: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Detalle del Pedido</h2>
              <button onClick={() => setSelectedOrderId(null)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", fontSize: "1.5rem", cursor: "pointer" }}>&times;</button>
            </div>
            
            {(() => {
              const order = orders.find(o => o.id === selectedOrderId);
              if (!order) return null;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.95rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>ID Pedido:</span>
                    <strong style={{ fontFamily: "monospace", color: "var(--primary)" }}>#{order.id.slice(0, 8)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Fecha:</span>
                    <strong>{formatDateDisplay(order.createdAt).date} {formatDateDisplay(order.createdAt).time}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted)" }}>Estado:</span>
                    <span className="lp-pill" style={{ background: order.status === "confirmed" ? "rgba(34,197,94,0.2)" : "rgba(56,189,248,0.2)", color: order.status === "confirmed" ? "#4ade80" : "var(--accent)", fontWeight: 600, fontSize: "0.8rem" }}>{order.status.toUpperCase()}</span>
                  </div>
                  
                  <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />
                  
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>Cliente:</span>
                    <strong style={{ fontSize: "1.05rem" }}>{order.customerName || "Cliente"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>WhatsApp:</span>
                    <span>{formatPhoneDisplay(order.conversationId)}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>Dirección de Entrega:</span>
                    <span style={{ color: "#fef08a", fontWeight: 500 }}>{order.deliveryAddress || "Por confirmar"}</span>
                  </div>
                  
                  <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />
                  
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.2rem" }}>Resumen de Productos:</span>
                    <div style={{ background: "rgba(255,255,255,0.05)", padding: "0.75rem", borderRadius: 8 }}>
                      {order.itemsSummary || "N/A"}
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>Medio de Pago:</span>
                    <strong style={{ color: "#34d399" }}>{order.paymentMethod || "N/A"}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
                    <span style={{ color: "var(--text-muted)" }}>Total:</span>
                    <strong style={{ fontSize: "1.25rem", color: "#38bdf8" }}>\${order.total.toLocaleString("es-CO")}</strong>
                  </div>
                  
                  <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={(e) => { handleDeleteOrder(order.id, e); setSelectedOrderId(null); }} className="lp-btn lp-btn-secondary" style={{ padding: "0.5rem 1rem", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                      Eliminar Pedido
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
`;

code = code.replace(
  '{/* ========================================================= */}\n        {/* TAB: WHATSAPP WEB STYLE QR CODE                           */}',
  modalCode + '\n        {/* ========================================================= */}\n        {/* TAB: WHATSAPP WEB STYLE QR CODE                           */}'
);

fs.writeFileSync('app/panel/page.tsx', code);
console.log("Updated app/panel/page.tsx");
