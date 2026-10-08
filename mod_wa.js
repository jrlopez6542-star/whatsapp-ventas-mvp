const fs = require('fs');

let code = `import { isEvolutionConfigured, sendEvolutionText, sendEvolutionPoll } from "@/lib/evolution";
import { isTwilioSendConfigured, sendWhatsAppMessage } from "@/lib/twilio";

export type OutboundWhatsAppResult =
  | { ok: true; id: string; channel: "evolution" | "twilio" }
  | { ok: false; error: string; channel: "evolution" | "twilio" | "none" };

export type WhatsAppChannel = "evolution" | "twilio" | "none";

export function getWhatsAppChannel(): WhatsAppChannel {
  if (isEvolutionConfigured()) return "evolution";
  if (isTwilioSendConfigured()) return "twilio";
  return "none";
}

export function isOutboundWhatsAppConfigured(): boolean {
  return getWhatsAppChannel() !== "none";
}

export async function sendOutboundWhatsApp(
  to: string,
  body: string
): Promise<OutboundWhatsAppResult> {
  const buttonsRegex = /\\[BOTONES:\\s*(.+?)\\]/i;
  const match = body.match(buttonsRegex);
  
  let cleanBody = body;
  let buttons = [];
  
  if (match) {
    cleanBody = body.replace(buttonsRegex, '').trim();
    buttons = match[1].split('|').map(b => b.trim()).filter(b => b);
  }

  if (isEvolutionConfigured()) {
    let r = { ok: true, id: 'none', error: '' };
    if (cleanBody) {
      r = await sendEvolutionText(to, cleanBody);
    }
    
    if (buttons.length > 0) {
      const pollRes = await sendEvolutionPoll(to, "Opciones:", buttons);
      if (!cleanBody && !pollRes.ok) {
        return { ok: false, error: pollRes.error, channel: "evolution" };
      }
      if (pollRes.ok) r = { ok: true, id: pollRes.id, error: '' };
    }

    if (r.ok) return { ok: true, id: r.id, channel: "evolution" };
    return { ok: false, error: r.error, channel: "evolution" };
  }

  if (isTwilioSendConfigured()) {
    const fallbackText = buttons.length > 0 ? \`\\n\\nOpciones:\\n\` + buttons.map((b, i) => \`\${i+1}. \${b}\`).join('\\n') : '';
    const r = await sendWhatsAppMessage(to, cleanBody + fallbackText);
    if (r.ok) return { ok: true, id: r.sid, channel: "twilio" };
    return { ok: false, error: r.error, channel: "twilio" };
  }

  return {
    ok: false,
    error: "Ningún canal configurado",
    channel: "none",
  };
}
`;

fs.writeFileSync('lib/whatsapp-send.ts', code);
