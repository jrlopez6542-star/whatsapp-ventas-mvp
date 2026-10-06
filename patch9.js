const fs = require('fs');
let c = fs.readFileSync('lib/agent/sales-agent.ts', 'utf8');

c = c.replace(
  /const catalogText = products\n\s*\.map\(\(p\) => \`- \\\[\$\{p\.sku\}\\] \$\{p\.name\}: \$\{formatCop\(p\.price\)\} \\\(\$\{p\.description \|\| "Deliciosos y frescos"\}\\\)\`\)/,
  'const catalogText = products.map((p) => `- ${p.name}: ${formatCop(p.price)} (${p.description || "Deliciosos y frescos"})`)'
);

c = c.replace(
  /const items = products\n\s*\.map\(\(p\) => \`🍩 \\\*\$\{p\.name\}\\\* \\\[\$\{p\.sku\}\\]\\n  Precio: \$\{formatCop\(p\.price\)\} - _\$\{p\.description \|\| "Delicioso y crujiente"\}_\`\)/,
  'const items = products.map((p) => `🍩 *${p.name}*\\n  Precio: ${formatCop(p.price)} - _${p.description || "Delicioso y crujiente"}_`)'
);

c = c.replace(
  'const itemsListText = finalItems.map((it) => `- ${it.name} [${it.sku}] x${it.quantity}: ${formatCop(it.unitPrice * it.quantity)}`).join("\\n");',
  'const itemsListText = finalItems.map((it) => `- ${it.name} x${it.quantity}: ${formatCop(it.unitPrice * it.quantity)}`).join("\\n");'
);

// Instruct AI not to use SKU
c = c.replace(
  '3. Usa un tono ALEGRE, VENDEDOR',
  '3. NUNCA le muestres el SKU al cliente. Usa solo el nombre del producto.\\n3. Usa un tono ALEGRE, VENDEDOR'
);

fs.writeFileSync('lib/agent/sales-agent.ts', c);
