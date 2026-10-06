import { isEvolutionConfigured, sendEvolutionText } from "@/lib/evolution";
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

/**
 * Envía texto por WhatsApp: Evolution si está configurado, si no Twilio.
 * `to` may be phone (whatsapp:+57… / digits), LID jid (…@lid), or whatsapp:lid:{id}.
 */
export async function sendOutboundWhatsApp(
  to: string,
  body: string
): Promise<OutboundWhatsAppResult> {
  if (isEvolutionConfigured()) {
    const r = await sendEvolutionText(to, body);
    if (r.ok) return { ok: true, id: r.id, channel: "evolution" };
    return { ok: false, error: r.error, channel: "evolution" };
  }

  if (isTwilioSendConfigured()) {
    const r = await sendWhatsAppMessage(to, body);
    if (r.ok) return { ok: true, id: r.sid, channel: "twilio" };
    return { ok: false, error: r.error, channel: "twilio" };
  }

  return {
    ok: false,
    error:
      "Ningún canal configurado: define Evolution (EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE) o Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)",
    channel: "none",
  };
}