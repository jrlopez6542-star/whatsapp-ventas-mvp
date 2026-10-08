const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

code = code.replace(
  '<span style={{ fontSize: "1.5rem" }}>🔥</span>\n          Ventas WhatsApp',
  '<span style={{ fontSize: "2rem" }}>🔥</span>'
);

code = code.replace(/<span>🛍️<\/span> Menú \/ Catálogo/g, '<span className="icon">🛍️</span> <span className="label">Menú / Catálogo</span>');
code = code.replace(/<span>🕘<\/span> Horarios/g, '<span className="icon">🕘</span> <span className="label">Horarios</span>');
code = code.replace(/<span>📱<\/span> Vincular WhatsApp/g, '<span className="icon">📱</span> <span className="label">Vincular WhatsApp</span>');

fs.writeFileSync('app/panel/page.tsx', code);
