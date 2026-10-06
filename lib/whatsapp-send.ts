1
import { isEvolutionConfigured, sendEvolutionText } from "@/lib/evolution";
2
import { isTwilioSendConfigured, sendWhatsAppMessage } from "@/lib/twilio";
3


4
export type OutboundWhatsAppResult =
5
  | { ok: true; id: string; channel: "evolution" | "twilio" }
6
  | { ok: false; error: string; channel: "evolution" | "twilio" | "none" };
7


8
export type WhatsAppChannel = "evolution" | "twilio" | "none";
9


10
export function getWhatsAppChannel(): WhatsAppChannel {
11
  if (isEvolutionConfigured()) return "evolution";
12
  if (isTwilioSendConfigured()) return "twilio";
13
  return "none";
14
}
15


16
export function isOutboundWhatsAppConfigured(): boolean {
17
  return getWhatsAppChannel() !== "none";
18
}
19


20
/**
21
 * Envía texto por WhatsApp: Evolution si está configurado, si no Twilio.
22
 * `to` may be phone (whatsapp:+57… / digits), LID jid (…@lid), or whatsapp:lid:{id}.
23
 */
24
export async function sendOutboundWhatsApp(
25
  to: string,
26
  body: string
27
): Promise<OutboundWhatsAppResult> {
28
  if (isEvolutionConfigured()) {
29
    const r = await sendEvolutionText(to, body);
30
    if (r.ok) return { ok: true, id: r.id, channel: "evolution" };
