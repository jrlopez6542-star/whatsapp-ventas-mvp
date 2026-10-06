/**
 * Cliente Evolution API v2 (Baileys) + helpers de webhook.
 * Docs: POST /message/sendText/{instance} — header apikey
 *
 * WhatsApp privacy JIDs (@lid): inbound often arrives as NNN@lid with no phone.
 * Outbound must use the full "{id}@lid" string — digits-only LID → 400 exists:false.
 * Phone JIDs (@s.whatsapp.net / @c.us) still send digits only (573…).
 */

export type SendEvolutionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type ParsedEvolutionInbound = {
  messageId: string;
  /** Conversation key: whatsapp:+57… or whatsapp:lid:{id} */
  from: string;
  /** Phone digits when known; empty when only LID */
  digits: string;
  /** Full remoteJid (incl. @lid) for send fallback */
  replyJid: string;
  text: string;
  fromMe: boolean;
  isGroup: boolean;
  pushName?: string;
};

export function isEvolutionConfigured(): boolean {
  return Boolean(
    process.env.EVOLUTION_API_URL?.trim() &&
      process.env.EVOLUTION_API_KEY?.trim() &&
      process.env.EVOLUTION_INSTANCE?.trim()
  );
}

type UnknownRecord = Record<string, unknown>;

function asRecord(v: unknown): UnknownRecord | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as UnknownRecord)
    : null;
}

function strField(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** @s.whatsapp.net / @c.us → phone JID */
export function isPhoneJid(jid: string): boolean {
  const j = (jid || "").toLowerCase();
  return j.endsWith("@s.whatsapp.net") || j.endsWith("@c.us");
}

/** Privacy Linked-ID JID */
export function isLidJid(jid: string): boolean {
  return (jid || "").toLowerCase().includes("@lid");
}

/**
 * Digits look like an international phone (not an opaque LID).
 * Colombia mobile with country: 57 + 10 digits = 12; intl typically 8–13.
 * LIDs are often 14–15+ digit opaque ids (e.g. 271296004931588).
 */
export function looksLikePhoneDigits(digits: string): boolean {
  if (!digits || !/^\d+$/.test(digits)) return false;
  if (digits.length < 8 || digits.length > 13) return false;
  // Colombia local mobile without country (10 starting with 3)
  if (digits.length === 10 && digits.startsWith("3")) return true;
  // Colombia with country code
  if (digits.length === 12 && digits.startsWith("57")) return true;
  // Generic E.164-ish (not starting like a huge LID blob)
  return digits.length >= 8 && digits.length <= 13;
}

/** True if digits match EVOLUTION_OWNER_NUMBER (instance business phone). */
export function isEvolutionOwnerDigits(digits: string): boolean {
  if (!digits) return false;
  const owner = process.env.EVOLUTION_OWNER_NUMBER?.trim();
  if (!owner) return false;
  const ownerDigits = normalizeEvolutionNumber(owner);
  return Boolean(ownerDigits && digits === ownerDigits);
}

/** Digits only; Colombia-friendly (10 dígitos empezando en 3 → +57). */
export function normalizeEvolutionNumber(raw: string): string {
  let s = (raw || "").trim();
  s = s.replace(/^whatsapp:/i, "");
  // conversation key whatsapp:lid:{id}
  if (/^lid:/i.test(s)) {
    s = s.replace(/^lid:/i, "");
  }
  // remoteJid → number part
  const at = s.indexOf("@");
  if (at >= 0) s = s.slice(0, at);
  s = s.replace(/\D/g, "");
  if (s.length === 10 && s.startsWith("3")) {
    s = `57${s}`;
  }
  return s;
}

/** Extract full JID if present in raw (…@lid / …@s.whatsapp.net / …@c.us). */
export function extractJid(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  // whatsapp:lid:{id} → {id}@lid
  const lidKey = s.match(/^whatsapp:lid:(\d+)$/i);
  if (lidKey) return `${lidKey[1]}@lid`;
  if (isLidJid(s) || isPhoneJid(s)) {
    // strip whatsapp: prefix if any
    return s.replace(/^whatsapp:/i, "");
  }
  return "";
}

/**
 * Conversation key compatible with Twilio webhook From.
 * Phone → whatsapp:+573…; LID-only → whatsapp:lid:{id} (never invent +27129… as phone).
 */
export function evolutionFromToConversationKey(raw: string): string {
  const jid = extractJid(raw) || (raw || "").trim();
  if (isLidJid(jid)) {
    const id = normalizeEvolutionNumber(jid);
    if (!id) return "whatsapp:unknown";
    return `whatsapp:lid:${id}`;
  }
  const digits = normalizeEvolutionNumber(raw);
  if (!digits) return "whatsapp:unknown";
  if (!looksLikePhoneDigits(digits)) {
    // opaque digits without @lid suffix — still treat as LID key
    return `whatsapp:lid:${digits}`;
  }
  return `whatsapp:+${digits}`;
}

/**
 * Resolve Evolution sendText `number` field:
 * - phone → digits only (573…)
 * - LID → full "{id}@lid" (digits-only LID fails 400 exists:false)
 */
export function resolveEvolutionSendNumber(to: string): {
  number: string;
  kind: "phone" | "lid" | "invalid";
} {
  const raw = (to || "").trim();
  if (!raw) return { number: "", kind: "invalid" };

  const jid = extractJid(raw);
  if (jid && isLidJid(jid)) {
    // Prefer keeping full jid as provided; normalize to digits@lid
    const id = normalizeEvolutionNumber(jid);
    if (!id) return { number: "", kind: "invalid" };
    return { number: `${id}@lid`, kind: "lid" };
  }

  if (jid && isPhoneJid(jid)) {
    const digits = normalizeEvolutionNumber(jid);
    if (looksLikePhoneDigits(digits)) {
      return { number: digits, kind: "phone" };
    }
  }

  // whatsapp:+57… / bare digits / whatsapp:lid:…
  if (/^whatsapp:lid:/i.test(raw) || /^lid:/i.test(raw.replace(/^whatsapp:/i, ""))) {
    const id = normalizeEvolutionNumber(raw);
    if (!id) return { number: "", kind: "invalid" };
    return { number: `${id}@lid`, kind: "lid" };
  }

  const digits = normalizeEvolutionNumber(raw);
  if (!digits) return { number: "", kind: "invalid" };
  if (looksLikePhoneDigits(digits)) {
    return { number: digits, kind: "phone" };
  }
  // Long opaque digits → LID
  return { number: `${digits}@lid`, kind: "lid" };
}

export function verifyEvolutionWebhookSecret(
  headerValue: string | null
): boolean {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
  if (!secret) return true; // optional
  if (!headerValue) return false;
  return headerValue === secret;
}

function extractTextFromMessage(message: UnknownRecord | null): string {
  if (!message) return "";
  if (typeof message.conversation === "string") return message.conversation;
  const ext = asRecord(message.extendedTextMessage);
  if (ext && typeof ext.text === "string") return ext.text;
  const img = asRecord(message.imageMessage);
  if (img && typeof img.caption === "string") return img.caption;
  const vid = asRecord(message.videoMessage);
  if (vid && typeof vid.caption === "string") return vid.caption;
  const btn = asRecord(message.buttonsResponseMessage);
  if (btn && typeof btn.selectedDisplayText === "string") {
    return btn.selectedDisplayText;
  }
  const list = asRecord(message.listResponseMessage);
  if (list && typeof list.title === "string") return list.title;
  return "";
}

/** Collect candidate JID/phone strings from Evolution v2 upsert payload. */
function collectJidCandidates(
  msg: UnknownRecord,
  key: UnknownRecord
): string[] {
  const fields = [
    key.remoteJidAlt,
    msg.remoteJidAlt,
    key.senderPn,
    msg.senderPn,
    msg.cleanedSenderPn,
    key.cleanedSenderPn,
    key.participantAlt,
    msg.participantAlt,
    msg.participant,
    key.participant,
    // some Evolution builds put PN on root sender
    msg.sender,
    // addressing helpers
    key.remoteJid,
    msg.remoteJid,
  ];
  const out: string[] = [];
  for (const f of fields) {
    const s = strField(f);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Pick best phone JID/digits from candidates; prefer @s.whatsapp.net / @c.us
 * and phone-looking digits over @lid.
 */
export function pickBestPhoneTarget(
  remoteJid: string,
  candidates: string[]
): { phoneDigits: string; phoneJid: string } {
  const all = [remoteJid, ...candidates].filter(Boolean);
  // 1) Explicit phone JIDs
  for (const c of all) {
    if (isPhoneJid(c)) {
      const digits = normalizeEvolutionNumber(c);
      if (looksLikePhoneDigits(digits)) {
        return { phoneDigits: digits, phoneJid: c };
      }
    }
  }
  // 2) Bare phone-looking strings / digits
  for (const c of all) {
    if (isLidJid(c)) continue;
    const digits = normalizeEvolutionNumber(c);
    if (looksLikePhoneDigits(digits)) {
      return { phoneDigits: digits, phoneJid: "" };
    }
  }
  return { phoneDigits: "", phoneJid: "" };
}

/**
 * Parse Evolution webhook body for MESSAGES_UPSERT / messages.upsert.
 * Supports payload with data as object or array of messages.
 */
export function parseEvolutionUpsert(
  body: unknown
): ParsedEvolutionInbound | null {
  const root = asRecord(body);
  if (!root) return null;

  const eventRaw = String(root.event || root.type || "").toLowerCase();
  const isUpsert =
    eventRaw === "messages.upsert" ||
    eventRaw === "messages_upsert" ||
    eventRaw === "message.upsert" ||
    // some installs omit event when only MESSAGES_UPSERT is subscribed
    !eventRaw;

  if (eventRaw && !isUpsert) return null;

  let data = root.data;
  // sometimes nested: { data: { messages: [...] } } or array
  if (Array.isArray(data)) {
    data = data[0];
  } else {
    const d = asRecord(data);
    if (d && Array.isArray(d.messages)) {
      data = d.messages[0];
    }
  }

  const msg = asRecord(data);
  if (!msg) return null;

  const key = asRecord(msg.key) || {};
  const remoteJid = strField(key.remoteJid || msg.remoteJid);
  const fromMe = Boolean(key.fromMe ?? msg.fromMe);
  const messageId = String(key.id || msg.id || "");
  const isGroup =
    remoteJid.endsWith("@g.us") ||
    remoteJid.includes("@g.us") ||
    Boolean(msg.isGroup);

  const remoteIsLid = isLidJid(remoteJid);
  let phoneDigits = "";
  let replyJid = remoteJid;

  if (remoteIsLid) {
    // LID chat: only accept phone from explicit customer PN JIDs.
    // Never use bare root.sender / instance owner (common Evolution pitfall —
    // root.sender is the business number, which made us reply to ourselves).
    const customerPnFields = [
      key.remoteJidAlt,
      msg.remoteJidAlt,
      key.senderPn,
      msg.senderPn,
      msg.cleanedSenderPn,
      key.cleanedSenderPn,
      key.participantAlt,
      msg.participantAlt,
    ];
    for (const f of customerPnFields) {
      const s = strField(f);
      if (!isPhoneJid(s)) continue;
      const d = normalizeEvolutionNumber(s);
      if (looksLikePhoneDigits(d) && !isEvolutionOwnerDigits(d)) {
        phoneDigits = d;
        break;
      }
    }
    // Always keep full @lid for outbound (digits-only LID → 400 exists:false)
    replyJid = remoteJid;
  } else {
    const candidates = collectJidCandidates(msg, key);
    // root.sender can carry PN for classic phone chats (not LID)
    const rootSender = strField(root.sender);
    if (rootSender) candidates.unshift(rootSender);

    const picked = pickBestPhoneTarget(remoteJid, candidates);
    phoneDigits = picked.phoneDigits;
    if (isEvolutionOwnerDigits(phoneDigits)) {
      phoneDigits = "";
    }
    if (phoneDigits) {
      const phoneCand = candidates.find(
        (c) => isPhoneJid(c) && normalizeEvolutionNumber(c) === phoneDigits
      );
      replyJid = phoneCand || remoteJid;
    }
  }

  const text = extractTextFromMessage(asRecord(msg.message) || msg).trim();
  const pushName =
    typeof msg.pushName === "string" ? msg.pushName : undefined;

  if (!phoneDigits && !remoteJid) return null;

  // LID-only: from = whatsapp:lid:{id}, digits empty, replyJid = full @lid
  const from =
    remoteIsLid && !phoneDigits
      ? evolutionFromToConversationKey(remoteJid)
      : phoneDigits
        ? `whatsapp:+${phoneDigits}`
        : evolutionFromToConversationKey(remoteJid);

  return {
    messageId,
    from,
    digits: remoteIsLid && !phoneDigits ? "" : phoneDigits,
    replyJid,
    text,
    fromMe,
    isGroup,
    pushName,
  };
}

export function isMessagesUpsertEvent(body: unknown): boolean {
  const root = asRecord(body);
  if (!root) return false;
  const eventRaw = String(root.event || root.type || "").toLowerCase();
  if (!eventRaw) {
    // Heuristic: looks like a message upsert payload
    const data = asRecord(root.data);
    return Boolean(data && (data.key || data.message));
  }
  return (
    eventRaw === "messages.upsert" ||
    eventRaw === "messages_upsert" ||
    eventRaw === "message.upsert"
  );
}

async function postSendText(
  url: string,
  apiKey: string,
  number: string,
  text: string
): Promise<{
  ok: boolean;
  status: number;
  id: string;
  error: string;
  rawBody: string;
}> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ number, text }),
  });

  const rawBody = await res.text().catch(() => "");
  let data: {
    key?: { id?: string };
    message?: string;
    error?: string | { message?: string };
    response?: { message?: string };
  } = {};
  try {
    data = rawBody ? (JSON.parse(rawBody) as typeof data) : {};
  } catch {
    // keep empty
  }

  if (!res.ok) {
    const errMsg =
      (typeof data.error === "string" && data.error) ||
      (typeof data.error === "object" && data.error?.message) ||
      data.message ||
      data.response?.message ||
      (rawBody && rawBody.slice(0, 500)) ||
      `Evolution HTTP ${res.status}`;
    return {
      ok: false,
      status: res.status,
      id: "",
      error: typeof errMsg === "string" ? errMsg : `Evolution HTTP ${res.status}`,
      rawBody,
    };
  }

  return {
    ok: true,
    status: res.status,
    id: data.key?.id || "",
    error: "",
    rawBody,
  };
}

/**
 * POST /message/sendText/{instance}
 * Phone → { number: "573…" }; LID → { number: "…@lid" } (never digits-only LID).
 */
export async function sendEvolutionText(
  toPhone: string,
  text: string
): Promise<SendEvolutionResult> {
  const base = process.env.EVOLUTION_API_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  const instance = process.env.EVOLUTION_INSTANCE?.trim();

  if (!base || !apiKey || !instance) {
    return {
      ok: false,
      error:
        "Faltan EVOLUTION_API_URL, EVOLUTION_API_KEY o EVOLUTION_INSTANCE",
    };
  }

  const resolved = resolveEvolutionSendNumber(toPhone);
  if (resolved.kind === "invalid" || !resolved.number) {
    return { ok: false, error: "Número inválido para Evolution" };
  }

  const url = `${base}/message/sendText/${encodeURIComponent(instance)}`;

  try {
    // Primary attempt with correctly typed number (phone digits OR full @lid)
    let result = await postSendText(url, apiKey, resolved.number, text);

    // If phone send got 400 and we were given a LID-looking raw, retry with @lid
    if (!result.ok && result.status === 400 && resolved.kind === "phone") {
      const jid = extractJid(toPhone);
      if (jid && isLidJid(jid)) {
        console.warn("[evolution] phone send 400 — retry with lid jid", {
          phone: resolved.number,
          jid,
        });
        result = await postSendText(url, apiKey, jid, text);
      }
    }

    // If somehow we sent digits for a LID (legacy callers), retry with @lid
    if (
      !result.ok &&
      result.status === 400 &&
      resolved.kind === "lid" &&
      !resolved.number.includes("@")
    ) {
      const lid = `${normalizeEvolutionNumber(toPhone)}@lid`;
      console.warn("[evolution] lid digits 400 — retry with full jid", { lid });
      result = await postSendText(url, apiKey, lid, text);
    }

    if (!result.ok) {
      console.error("[evolution] sendText failed", {
        status: result.status,
        number: resolved.number,
        kind: resolved.kind,
        error: result.error,
        body: result.rawBody?.slice(0, 800),
      });
      return { ok: false, error: result.error || "Bad Request" };
    }

    return { ok: true, id: result.id };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Error de red al llamar Evolution API",
    };
  }
}