const fs = require('fs');
let code = fs.readFileSync('app/panel/page.tsx', 'utf8');

code = code.replace(/<span>💬<\/span> Chats en Vivo/g, '<span className="icon">💬</span> <span className="label">Chats en Vivo</span>');
code = code.replace(/<span>📦<\/span> Pedidos/g, '<span className="icon">📦</span> <span className="label">Pedidos</span>');
code = code.replace(/<span>🛍️<\/span> Catálogo/g, '<span className="icon">🛍️</span> <span className="label">Catálogo</span>');
code = code.replace(/<span>🤖<\/span> Ajustes IA/g, '<span className="icon">🤖</span> <span className="label">Ajustes IA</span>');

fs.writeFileSync('app/panel/page.tsx', code);
