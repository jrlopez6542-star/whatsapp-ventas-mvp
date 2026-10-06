import { after, NextRequest, NextResponse } from "next/server";
import {
  isLidJid,
  isMessagesUpsertEvent,
  parseEvolutionUpsert,
  verifyEvolutionWebhookSecret,
} from "@/lib/evolution";
import { sendDelayedOutboundWhatsApp } from "@/lib/outbound-queue";
import { claimWebhookEvent } from "@/lib/webhook-dedupe";
import { handleSalesMessage } from "@/lib/agent/sales-agent";
import {
  appendMessage,
  getConversation,
  getOrCreateConversation,
  setConversationStatus,
} from "@/lib/store";

export const runtime = "nodejs";
/** Delay (≤5.5s) + LLM + Evolution REST; keep room under Vercel hobby/pro caps. */
export const maxDuration = 60;

function jsonOk(extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...extra }, { status: 200 });
}

/**
 * Prefer full @lid replyJid when present (digits may be owner/business number
 * or empty for LID-only chats). Digits-only LID → Evolution 400 exists:false.
 * Phone chats without lid: prefer digits, else conversation from key.
 */
function replyTargetFromParsed(parsed: {
  digits: string;
  replyJid: string;
  from: string;
}): string {
  if (parsed.replyJid && isLidJid(parsed.replyJid)) return parsed.replyJid;
  if (parsed.digits) return parsed.digits;
  return parsed.from;
}

/** Health / probe */
export async function GET() {
  return new NextResponse("ok", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Evolution inbound webhook (MESSAGES_UPSERT).
 * ACK 200 quickly for non-reply events. For text replies: generate the answer,
 * then schedule the delayed send with `after()` so Evolution is not held open
 * for the human-like pause (avoids webhook timeouts / retries).
 */
export async function POST(request: NextRequest) {
  const secretHeader =
    request.headers.get("x-evolution-secret") ||
    request.headers.get("x-webhook-secret");
  if (!verifyEvolutionWebhookSecret(secretHeader)) {
    console.warn("[evolution] invalid webhook secret");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn("[evolution] invalid JSON body");
    return jsonOk({ skipped: "invalid_json" });
  }

  try {
    if (!isMessagesUpsertEvent(body)) {
      return jsonOk({ skipped: "not_upsert" });
    }

    const parsed = parseEvolutionUpsert(body);
    if (!parsed) {
      return jsonOk({ skipped: "unparseable" });
    }

    if (parsed.fromMe) {
      return jsonOk({ skipped: "fromMe" });
    }
    if (parsed.isGroup) {
      return jsonOk({ skipped: "group" });
    }

    const text = (parsed.text || "").trim();
    if (!text) {
      return jsonOk({ skipped: "empty_body" });
    }

    if (parsed.messageId) {
      const claimed = await claimWebhookEvent(parsed.messageId);
      if (!claimed) {
        return jsonOk({ skipped: "duplicate", id: parsed.messageId });
      }
    }

    console.log("[evolution inbound]", {
      id: parsed.messageId,
      from: parsed.from,
      digits: parsed.digits || null,
      replyJid: parsed.replyJid,
      textLen: text.length,
      pushName: parsed.pushName,
    });

    const fromKey = parsed.from;
    const conv = await getOrCreateConversation(fromKey);

    // Guardar el mensaje del usuario de inmediato en el historial de chat del panel
    await appendMessage(fromKey, "user", text);

    if (conv.status === "human") {
      console.log("[evolution] human mode — skip AI", { from: fromKey });
      return jsonOk({ mode: "human" });
    }

    if (conv.status === "closed") {
      await setConversationStatus(fromKey, "bot");
    }

    const { reply, mode } = await handleSalesMessage(fromKey, text, parsed.pushName);
    const replyTo = replyTargetFromParsed(parsed);
    console.log("[evolution reply]", {
      from: fromKey,
      replyTo,
      mode,
      replyLen: reply.length,
      deferred: true,
    });

    after(async () => {
      try {
        const latest = await getConversation(fromKey);
        if (latest?.status === "human") {
          console.log("[evolution] skip deferred send — human mode", {
            from: fromKey,
          });
          return;
        }
        const send = await sendDelayedOutboundWhatsApp(fromKey, replyTo, reply);
        if (!send.ok) {
          console.error("[evolution] outbound failed", send);
        } else {
          console.log("[evolution] outbound sent", {
            from: fromKey,
            channel: send.channel,
            delayMs: send.delayMs,
            id: send.id,
          });
        }
      } catch (err) {
        console.error("[evolution] deferred outbound error", err);
      }
    });

    return jsonOk({
      mode,
      queued: true,
      channel: "deferred",
    });
  } catch (err) {
    console.error("[evolution] webhook error", err);
    return jsonOk({ error: "logged" });
  }
}