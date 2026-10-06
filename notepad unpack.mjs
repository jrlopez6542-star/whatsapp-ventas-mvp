import fs from 'fs';
import path from 'path';

const content = fs.readFileSync('proyecto_completo.txt', 'utf8');
const regex = /=== FILE: (.*?) ===\n([\s\S]*?)=== END FILE ===/g;
let match;
let count = 0;

// Lista de archivos que pertenecen a la carpeta lib/
const libFiles = [
  'outbound-queue.ts', 'twilio.ts', 'webhook-dedupe.ts', 
  'whatsapp-send.ts', 'turso.ts', 'db.ts', 'openai.ts', 'evolution.ts'
];

while ((match = regex.exec(content)) !== null) {
  let fileName = match[1].trim();
  const fileContent = match[2];

  // Si es un archivo de lógica interna y no tiene ruta, asignarlo a lib/
  if (libFiles.includes(fileName)) {
    fileName = path.join('lib', fileName);
  }

  fs.mkdirSync(path.dirname(fileName), { recursive: true });
  fs.writeFileSync(fileName, fileContent.trimStart());
  count++;
  console.log(`Reconstruido: ${fileName}`);
}

console.log(`\n¡Listo! Se desempaquetaron ${count} archivos correctamente.`);