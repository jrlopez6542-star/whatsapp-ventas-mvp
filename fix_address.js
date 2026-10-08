const fs = require('fs');

let code = fs.readFileSync('lib/agent/sales-agent.ts', 'utf8');

const regexToReplace = /function extractAddress\(text: string\): string \| null \{[\s\S]*?return null;\n\}/;

const newFunc = `function extractAddress(text: string): string | null {
  // First look for standard street patterns to avoid matching entire prompt
  const streetMatch = text.match(/(?:calle|cll|cra|carrera|diagonal|diag|transversal|trans|av|avenida)\\s+\\d+[a-zA-Z]?\\s*(?:#|no|nro|n\\u00famero|numero)?\\s*\\d+[a-zA-Z]?\\s*[-]?\\s*\\d+(?:\\s*(?:apto|int|torre|casa|barrio)\\s*[a-zA-Z0-9 ]{1,20})?/i);
  if (streetMatch) return streetMatch[0].trim();

  // If no street pattern, look for 'dirección: XXXX' but limit capture length
  const match = text.match(
    /\\b(?:direcci[o\\u00f3]n|enviar a|para la|despachar a)[:\\s]+([a-zA-Z0-9# -]{5,40})/i
  );
  if (match) return match[1].trim();

  return null;
}`;

code = code.replace(regexToReplace, newFunc);
fs.writeFileSync('lib/agent/sales-agent.ts', code);
console.log("Updated extractAddress");
