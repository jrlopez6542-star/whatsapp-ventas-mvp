const fs = require('fs');
let c = fs.readFileSync('app/panel/page.tsx', 'utf8');

c = c.replace(
  '<th style={{ padding: "0.75rem" }}>Fecha</th>',
  '<th style={{ padding: "0.75rem" }}>Fecha</th>\n                        <th style={{ padding: "0.75rem" }}>Acción</th>'
);

c = c.replace(
  '{formatDateDisplay(o.createdAt).date}\n                          </td>\n                        </tr>',
  '{formatDateDisplay(o.createdAt).date}\n                          </td>\n                          <td style={{ padding: "0.75rem", textAlign: "center" }}><button onClick={(e) => handleDeleteOrder(o.id, e)} style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: "1.1rem" }} title="Eliminar pedido">🗑️</button></td>\n                        </tr>'
);

fs.writeFileSync('app/panel/page.tsx', c);
