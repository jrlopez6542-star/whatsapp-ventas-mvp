const fs = require('fs');
let c = fs.readFileSync('lib/evolution.ts', 'utf8');

const targetStr = '}\n  const base = process.env.EVOLUTION_API_URL?.trim().replace(/\\\\/$/, "");';
const cutIdx = c.indexOf(targetStr);
if (cutIdx !== -1) {
  c = c.substring(0, cutIdx + 1) + '\n';
  fs.writeFileSync('lib/evolution.ts', c);
}

const codeToAdd = `
export async function markEvolutionMessageAsRead(remoteJid: string, messageId: string) {
  const base = process.env.EVOLUTION_API_URL?.trim().replace(/\\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE?.trim();
  if (!base || !apiKey || !instance) return;
  const url = \`\${base}/chat/markMessageAsRead/\${encodeURIComponent(instance)}\`;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({ readMessages: [{ remoteJid, fromMe: false, id: messageId }] }),
    });
  } catch (e) {
    console.error("[evolution] markRead error:", e);
  }
}
`;

fs.writeFileSync('lib/evolution.ts', c + codeToAdd);
