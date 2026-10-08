const fs = require('fs');
let code = fs.readFileSync('lib/agent/sales-agent.ts', 'utf8');

// The original was: /(?:direcci[oó]n|enviar a|para la|despachar a|calle|carrera|cra|cll|diagonal|diag|transversal|trans|av|avenida|manzana|mz|barrio|apto|casa|conjunto)[^:\n,.]*[:\s]+([^.\n,]+(?:\s+[^.\n,]+)*)/i
const regexStr = /(?:\(\?\:direcci\[oó\]n\|enviar a\|para la\|despachar a\|calle\|carrera\|cra\|cll\|diagonal\|diag\|transversal\|trans\|av\|avenida\|manzana\|mz\|barrio\|apto\|casa\|conjunto\))\[\^:\\n,\.\]\*\\[:\\s\\]\+\(\[\^\.\\n,\]\+\(\?:\\s\+\[\^\.\\n,\]\+\)\*\)/i;

code = code.replace(
  /\(\?:direcci\[o\]n\|.*?conjunto\)/,
  '\\b(?:direcci[oó]n|enviar a|para la|despachar a|calle|carrera|cra|cll|diagonal|diag|transversal|trans|av|avenida|manzana|mz|barrio|apto|casa|conjunto)\\b'
);
fs.writeFileSync('lib/agent/sales-agent.ts', code);
