const fs = require('fs');
let code = fs.readFileSync('lib/agent/sales-agent.ts', 'utf8');

const target = 'const summary = orderItems.map((it) => `${it.sku} x${it.quantity}`).join(", ");';
const replacement = `
  let summary = orderItems.map((it) => \`\${it.sku} x\${it.quantity}\`).join(", ");
  const detMatch = assistantReply.match(/\\*Detalle del Pedido:\\*([\\s\\S]*?)(?:\\*Total a pagar:\\*|💵)/i);
  if (detMatch && detMatch[1]) {
    summary = detMatch[1].trim();
  }
`;

code = code.replace(target, replacement);
fs.writeFileSync('lib/agent/sales-agent.ts', code);
console.log("Updated sales-agent.ts to extract AI summary.");
