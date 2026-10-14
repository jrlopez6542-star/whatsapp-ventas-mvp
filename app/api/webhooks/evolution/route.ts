import { after, NextRequest, NextResponse } from "next/server";
import { markEvolutionMessageAsRead, getEvolutionMediaBase64 } from "@/lib/evolution";
import {
  isLidJid,
  isMessagesUpsertEvent,
  parseEvolutionUpsert,
  verifyEvolutionWebhookSecret,
} from "@/lib/evolution";
import { sendDelayedOutboundWhatsApp } from "@/lib/outbound-queue";
import { sendOutboundWhatsAppMedia } from "@/lib/whatsapp-send";
import { claimWebhookEvent } from "@/lib/webhook-dedupe";
import { handleSalesMessage } from "@/lib/agent/sales-agent";
import { verifyReceiptWithGemini } from "@/lib/agent/receipt-verifier";
import {
  appendMessage,
  getConversation,
  getOrCreateConversation,
  setConversationStatus,
  setConversationCustomerName,
  getOrders,
  updateOrderStatus,
  getOrgSettings,
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

const DEBOUNCE_WINDOW_MS = 3200;
const lastIncomingTimestamp = new Map<string, number>();

/**
 * Evolution inbound webhook (MESSAGES_UPSERT).
 * Fast ACK (<80ms): Persiste el mensaje del usuario y responde 200 OK de inmediato.
 * La carga pesada (LLM, Gemini Visión, PDFs) y la ventana de debouncing (3.2s)
 * se procesan asíncronamente en after() para evitar timeouts y ráfagas fragmentadas.
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

    // ATAJOS DE CONTROL POR COMANDOS MÓVILES (fromMe: true)
    if (parsed.fromMe) {
      const cleanCmd = (parsed.text || "").trim().toLowerCase();
      if (cleanCmd === "#pausar" || cleanCmd === "#humano") {
        console.log("[evolution fromMe command] Pausar bot por admin:", parsed.from);
        await setConversationStatus(parsed.from, "human");
        await appendMessage(parsed.from, "system", "⚠️ Regla activada: Escalado a agente humano por comando móvil (#pausar)");
        return jsonOk({ action: "paused_by_admin" });
      }
      if (cleanCmd === "#bot" || cleanCmd === "#activar") {
        console.log("[evolution fromMe command] Reactivar bot por admin:", parsed.from);
        await setConversationStatus(parsed.from, "bot");
        await appendMessage(parsed.from, "system", "🤖 Regla activada: Bot reactivado por comando móvil (#bot)");
        return jsonOk({ action: "activated_by_admin" });
      }
      return jsonOk({ skipped: "fromMe" });
    }

    if (parsed.isGroup) {
      return jsonOk({ skipped: "group" });
    }

    const isImage = Boolean(parsed.isMedia && parsed.mediaType === "image");
    const text = (parsed.text || "").trim();
    if (!text && !isImage) {
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
      isImage,
    });

    const fromKey = parsed.from;
    const conv = await getOrCreateConversation(fromKey);

    // Si WhatsApp envía pushName y no teníamos nombre de cliente, asignarlo
    if (parsed.pushName && !conv.customerName) {
      await setConversationCustomerName(fromKey, parsed.pushName).catch(() => {});
    }

    const replyTo = replyTargetFromParsed(parsed);

    // Guardar el mensaje del usuario de inmediato en el historial de chat del panel
    const userMessageContent = isImage
      ? (text ? `[Foto adjunta: ${text}]` : "📷 [Comprobante o Imagen adjunta]")
      : text;
    await appendMessage(fromKey, "user", userMessageContent);

    const arrivalTime = Date.now();
    lastIncomingTimestamp.set(fromKey, arrivalTime);

    // FAST ACK: Responder 200 OK inmediatamente (<80ms) delegando todo el procesamiento a after()
    after(async () => {
      try {
        // SISTEMA DE DEBOUNCING: Esperar 3.2s para agrupar ráfagas de mensajes del cliente
        await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_WINDOW_MS));

        // Si el cliente envió un mensaje más reciente durante la ventana, descartar esta ejecución
        const latestTime = lastIncomingTimestamp.get(fromKey);
        if (latestTime && latestTime > arrivalTime) {
          console.log("[evolution debounce] Mensaje posterior detectado, descartando ejecución anterior para agrupar ráfaga:", {
            from: fromKey,
            arrivalTime,
            latestTime,
          });
          return;
        }

        const currentConv = await getConversation(fromKey);
        if (currentConv?.status === "human") {
          console.log("[evolution] human mode — skip AI", { from: fromKey });
          return;
        }

        const orgSettings = await getOrgSettings().catch(() => null);
        if (orgSettings?.botEnabled === "false") {
          console.log("[evolution] bot is disabled via master switch — skipping auto-reply", { from: fromKey });
          return;
        }

        if (currentConv?.status === "closed") {
          await setConversationStatus(fromKey, "bot");
        }

        // SI ES UNA IMAGEN: Intentar verificar como comprobante de pago con Gemini Visión
        if (isImage) {
          console.log("[evolution] Analizando imagen entrante con Gemini Visión...", { from: fromKey });
          
          let imageBase64 = parsed.mediaBase64;
          let mimeType = "image/jpeg";
          if (!imageBase64 && parsed.messageId) {
            const fetched = await getEvolutionMediaBase64(parsed.messageId, parsed.rawMsg);
            if (fetched) {
              imageBase64 = fetched.base64;
              mimeType = fetched.mimeType || "image/jpeg";
            }
          }

          // Buscar si el cliente tiene un pedido activo esperando comprobante
          const allOrders = await getOrders().catch(() => []);
          const pendingOrder = allOrders.find(
            (o) =>
              (o.conversationId === fromKey || (conv.phone && o.conversationId.includes(conv.phone))) &&
              (o.status === "pending" || o.status === "confirmed")
          );

          if (imageBase64) {
            const verification = await verifyReceiptWithGemini(
              imageBase64,
              mimeType,
              pendingOrder?.total
            );

            console.log("[evolution receipt verification]", verification);

            if (verification.isReceipt) {
              if (pendingOrder) {
                await updateOrderStatus(pendingOrder.id, "preparing").catch((err) => {
                  console.error("[evolution] error updating order status to preparing:", err);
                });
              }

              const bankName = verification.bank || "transferencia";
              const amountFormatted = verification.amount
                ? `$${verification.amount.toLocaleString("es-CO")} COP`
                : pendingOrder
                ? `$${pendingOrder.total.toLocaleString("es-CO")} COP`
                : "";
              const refPart = verification.reference
                ? `\n🧾 *Aprobación / Comprobante:* #${verification.reference}`
                : "";

              const receiptReply = `¡Comprobante de ${bankName} verificado con éxito${amountFormatted ? ` por ${amountFormatted}` : ""}! 🎉${refPart}\n\nTu pedido ya entró a preparación en cocina 👨‍🍳🔥 En unos momentos tus buñuelos estarán doraditos, crujientes y listos para salir a domicilio. ¡Muchas gracias!`;

              await appendMessage(fromKey, "assistant", receiptReply);

              try {
                await sendDelayedOutboundWhatsApp(fromKey, replyTo, receiptReply, parsed.messageId);
              } catch (err) {
                console.error("[evolution] error sending receipt confirmation:", err);
              }

              return;
            }

            // Si la imagen NO es comprobante de pago y no vino con texto explicativo:
            if (!text) {
              const notReceiptReply =
                "Recibimos tu imagen 📸, pero no pudimos identificar con claridad los datos de un comprobante de pago exitoso (valor, fecha o entidad bancaria). Por favor verifica y envíanos la captura clara del comprobante de Nequi o Bre-B, o cuéntanos si necesitas ayuda con otro medio de pago.";
              await appendMessage(fromKey, "assistant", notReceiptReply);

              try {
                await sendDelayedOutboundWhatsApp(fromKey, replyTo, notReceiptReply, parsed.messageId);
              } catch (err) {
                console.error("[evolution] error sending notReceipt reply:", err);
              }

              return;
            }
          } else if (!text) {
            // No se pudo descargar la imagen y no hay texto: enviar mensaje amigable
            const fallbackReply =
              "¡Recibimos tu imagen! 📸 Nuestro equipo en Buñuelandia la está revisando en este momento para continuar con tu pedido. 👨‍🍳";
            await appendMessage(fromKey, "assistant", fallbackReply);

            try {
              await sendDelayedOutboundWhatsApp(fromKey, replyTo, fallbackReply, parsed.messageId);
            } catch (err) {
              console.error("[evolution] error sending fallback reply:", err);
            }

            return;
          }
        }

        const effectiveName = parsed.pushName || conv.customerName;
        const { reply, mode, mediaUrl, invoicePdfUrl, invoiceNumber } = await handleSalesMessage(fromKey, text, effectiveName);
        console.log("[evolution reply processed in after]", {
          from: fromKey,
          replyTo,
          mode,
          replyLen: reply.length,
          invoicePdfUrl: !!invoicePdfUrl,
        });

        const latestAfterSales = await getConversation(fromKey);
        if (latestAfterSales?.status === "human") {
          console.log("[evolution] skip deferred send — human mode", { from: fromKey });
          return;
        }

        const send = await sendDelayedOutboundWhatsApp(fromKey, replyTo, reply, parsed.messageId);
        if (mediaUrl) {
          try {
            await sendOutboundWhatsAppMedia(
              replyTo,
              mediaUrl,
              "📲 Aquí tienes el código QR para realizar tu pago por Nequi o Bre-B. Por favor envíanos el comprobante una vez realizado."
            );
          } catch (mErr) {
            console.error("[evolution] media outbound error", mErr);
          }
        }
        if (invoicePdfUrl) {
          try {
            await sendOutboundWhatsAppMedia(
              replyTo,
              invoicePdfUrl,
              `🧾 Factura Oficial #${invoiceNumber || ""} - ¡Gracias por tu compra en Buñuelandia! 🥟`
            );
          } catch (pdfErr) {
            console.error("[evolution] invoice pdf outbound error", pdfErr);
          }
        }
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
        console.error("[evolution] deferred background task error", err);
      }
    });

    return jsonOk({
      fastAck: true,
      queued: true,
    });
  } catch (err) {
    console.error("[evolution] webhook error", err);
    return jsonOk({ error: "logged" });
  }
}