import { isEvolutionConfigured, sendEvolutionText, sendEvolutionMedia } from "@/lib/evolution";
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

export async function sendOutboundWhatsAppMedia(
  to: string,
  mediaUrlOrBase64: string,
  caption?: string
): Promise<OutboundWhatsAppResult> {
  if (isEvolutionConfigured()) {
    const res = await sendEvolutionMedia(to, mediaUrlOrBase64, caption);
    if (res.ok) return { ok: true, id: res.id, channel: "evolution" };
    return { ok: false, error: res.error, channel: "evolution" };
  }
  return { ok: false, error: "Canal no configurado para media", channel: "none" };
}

export async function sendOutboundWhatsApp(
  to: string,
  body: string
): Promise<OutboundWhatsAppResult> {
  // Desactivar botones: Si el texto contiene [BOTONES:...], convertir a lista numerada en el texto
  const buttonsRegex = /\[BOTONES:\s*(.+?)\]/i;
  const match = body.match(buttonsRegex);
  
  let cleanBody = body;
  if (match) {
    const buttons = match[1].split('|').map(b => b.trim()).filter(b => b);
    const optionsText = buttons.length > 0 ? '\n\n' + buttons.map((b, i) => `${i + 1}️⃣ *${b}*`).join('\n') : '';
    cleanBody = body.replace(buttonsRegex, '').trim() + optionsText;
  }

  if (isEvolutionConfigured()) {
    const r = await sendEvolutionText(to, cleanBody);
    if (r.ok) return { ok: true, id: r.id, channel: "evolution" };
    return { ok: false, error: r.error, channel: "evolution" };
  }

  if (isTwilioSendConfigured()) {
    const r = await sendWhatsAppMessage(to, cleanBody);
    if (r.ok) return { ok: true, id: r.sid, channel: "twilio" };
    return { ok: false, error: r.error, channel: "twilio" };
  }

  return {
    ok: false,
    error: "Ningún canal configurado",
    channel: "none",
  };
}
