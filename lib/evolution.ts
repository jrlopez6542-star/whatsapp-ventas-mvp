1
/**
2
 * Cliente Evolution API v2 (Baileys) + helpers de webhook.
3
 * Docs: POST /message/sendText/{instance} — header apikey
4
 *
5
 * WhatsApp privacy JIDs (@lid): inbound often arrives as NNN@lid with no phone.
6
 * Outbound must use the full "{id}@lid" string — digits-only LID → 400 exists:false.
7
 * Phone JIDs (@s.whatsapp.net / @c.us) still send digits only (573…).
8
 */
9


10
export type SendEvolutionResult =
11
  | { ok: true; id: string }
12
  | { ok: false; error: string };
13


14
export type ParsedEvolutionInbound = {
15
  messageId: string;
16
  /** Conversation key: whatsapp:+57… or whatsapp:lid:{id} */
17
  from: string;
18
  /** Phone digits when known; empty when only LID */
19
  digits: string;
20
  /** Full remoteJid (incl. @lid) for send fallback */
21
  replyJid: string;
22
  text: string;
23
  fromMe: boolean;
24
  isGroup: boolean;
25
  pushName?: string;
26
};
27


28
export function isEvolutionConfigured(): boolean {
29
  return Boolean(
30
    process.env.EVOLUTION_API_URL?.trim() &&
31
      process.env.EVOLUTION_API_KEY?.trim() &&
32
      process.env.EVOLUTION_INSTANCE?.trim()
33
  );
