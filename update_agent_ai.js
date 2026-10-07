const fs = require('fs');
let code = fs.readFileSync('lib/agent/sales-agent.ts', 'utf8');

code = code.replace(
  'Tu objetivo es vender y hacer agua la boca del cliente.',
  'Tu objetivo principal es: ${settings.botObjective || "vender y hacer agua la boca del cliente."}'
);

const endTarget = '- NO confirmes el pedido hasta tener dirección, método de pago y las salsas elegidas si pidió una caja surtida.`;';
const newEnd = "- NO confirmes el pedido hasta tener dirección, método de pago y las salsas elegidas si pidió una caja surtida.\\n\\n  ${settings.extraPrompt ? `💡 INSTRUCCIONES ADICIONALES (¡Síguelas al pie de la letra!):\\n  ${settings.extraPrompt}` : ''}`;";

code = code.replace(endTarget, newEnd);

fs.writeFileSync('lib/agent/sales-agent.ts', code);
console.log("Updated lib/agent/sales-agent.ts with prompt injections");
