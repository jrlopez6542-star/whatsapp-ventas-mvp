const fs = require('fs');
let code = fs.readFileSync('lib/agent/sales-agent.ts', 'utf8');

const index = code.indexOf('- NO confirmes el pedido hasta tener direcc');

if (index !== -1) {
  const nextLineIdx = code.indexOf('\n  // 2. Intentar con Google Gemini', index);
  if (nextLineIdx !== -1) {
    const newBlock = '- NO confirmes el pedido hasta tener dirección, método de pago y las salsas elegidas si pidió una caja surtida.\n\n  BOTONES INTERACTIVOS DE WHATSAPP (¡MUY IMPORTANTE!):\n  Puedes enviarle botones interactivos al cliente para facilitarle la respuesta. Para enviarlos, al puro final de tu mensaje añade exactamente esta estructura:\n  [BOTONES: Opción 1 | Opción 2]\n  Reglas de los botones:\n  - Máximo 3 botones.\n  - Cada opción debe ser corta (ej: "Ver Catálogo", "Comprar Caja x4", "Comprar Caja x8", "Hablar con Asesor").\n  - Úsalos estratégicamente para guiar al cliente al siguiente paso del flujo.\n\n  ${settings.extraPrompt ? `📌 INSTRUCCIONES ADICIONALES (¡Síguelas al pie de la letra!):\\n  ${settings.extraPrompt}` : \'\'}`;';
    
    code = code.substring(0, index) + newBlock + code.substring(nextLineIdx);
    fs.writeFileSync('lib/agent/sales-agent.ts', code);
    console.log('Successfully updated system prompt.');
  }
}
