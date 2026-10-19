import { after, NextRequest, NextResponse } from "next/server";
import {
  isLidJid,
  isMessagesUpsertEvent,
  parseEvolutionUpsert,
  verifyEvolutionWebhookSecret,
  markEvolutionMessageAsRead,
  sendEvolutionPresence,
  getEvolutionMediaBase64,
  parseEvolutionCall,
  parseEvolutionMessageUpdate,
  rejectEvolutionCall,
} from "@/lib/evolution";
import {
  dispatchAudioTranscriptionResult,
  getAudioTranscriptionFailureReply,
  transcribeWhatsAppAudio,
} from "@/lib/agent/audio-transcriber";
import { sendDelayedOutboundWhatsApp } from "@/lib/outbound-queue";
import { sendOutboundWhatsAppMedia } from "@/lib/whatsapp-send";
import {
  claimWebhookEvent,
  claimWebhookEventDetailed,
  completeWebhookEvent,
  failWebhookEvent,
} from "@/lib/webhook-dedupe";
import { isPhoneWhitelisted, logWhitelistRejection } from "@/lib/security-whitelist";
import { handleSalesMessage } from "@/lib/agent/sales-agent";
import { verifyReceiptWithGemini } from "@/lib/agent/receipt-verifier";
import { notifyDeliveryDriver } from "@/lib/delivery-driver";
import { pickRandomVariation } from "@/lib/anti-ban";
import { logSystemEvent } from "@/lib/logger";
import {
  appendMessage,
  updateMessageContent,
  updateMessageDeliveryStatus,
  updateMessageDeliveryStatusByProviderId,
  getConversation,
  getOrCreateConversation,
  setConversationStatus,
  setConversationCustomerName,
  getOrders,
  updateOrderStatus,
  getOrgSettings,
  getMessages,
} from "@/lib/store";

export const runtime = "nodejs";
/** Delay (≤5.5s) + LLM + Evolution REST; keep room under Vercel hobby/pro caps. */
export const maxDuration = 60;

function jsonOk(extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...extra }, { status: 200 });
}

function safeWebhookErrorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error && typeof error.name === "string"
    ? error.name.slice(0, 40)
    : "WebhookError";
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

const DEBOUNCE_WINDOW_MS = 2000;
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
    // 0. Manejo de actualizaciones de estado de mensajes (DELIVERY_ACK / READ / FAILED)
    const msgUpdate = parseEvolutionMessageUpdate(body);
    if (msgUpdate) {
      const deliveryStatus = msgUpdate.status === "failed" ? "failed" : "delivered";
      await updateMessageDeliveryStatusByProviderId(msgUpdate.messageId, deliveryStatus);
      return jsonOk({ messageUpdate: msgUpdate.status, messageId: msgUpdate.messageId });
    }

    // 1. Manejo de llamadas entrantes de WhatsApp (voz o video)
    const incomingCall = parseEvolutionCall(body);
    if (incomingCall) {
      const callTarget = incomingCall.replyJid || incomingCall.from;
      const callCheck = isPhoneWhitelisted(callTarget);
      if (!callCheck.allowed) {
        logWhitelistRejection("inbound", callTarget, callCheck.reason);
        return jsonOk({ skipped: "not_whitelisted", callId: incomingCall.id });
      }

      const callClaimed = await claimWebhookEvent("call_" + incomingCall.id);
      if (!callClaimed) {
        return jsonOk({ skipped: "duplicate_call", id: incomingCall.id });
      }

      console.log("[evolution call received]", incomingCall);
      logSystemEvent(
        "warn",
        "whatsapp",
        `Llamada entrante (${incomingCall.isVideo ? "videollamada" : "voz"}) rechazada automáticamente`,
        { from: incomingCall.from, replyJid: incomingCall.replyJid }
      );
      // Rechazar llamada en Evolution API de inmediato
      await rejectEvolutionCall(incomingCall.id, incomingCall.replyJid).catch(() => {});

      // Registrar aviso en el chat
      await appendMessage(
        incomingCall.from,
        "system",
        `📞 Llamada entrante de WhatsApp (${incomingCall.isVideo ? "videollamada" : "voz"}) rechazada automáticamente`
      ).catch(() => {});

      // Notificar al cliente asíncronamente con estado de pedido o mensaje de bienvenida
      after(async () => {
        try {
          const orgSettings = await getOrgSettings().catch(() => null);
          if (orgSettings?.botEnabled === "false") return;

          const conv = await getConversation(incomingCall.from);
          if (conv?.status === "human") return;

          const allOrders = await getOrders().catch(() => []);
          const activeOrder = allOrders.find(
            (o) =>
              (o.conversationId === incomingCall.from || (conv?.phone && o.conversationId.includes(conv.phone))) &&
              (o.status === "pending" || o.status === "confirmed" || o.status === "preparing" || o.status === "delivering")
          );

          let replyMsg = "";
          if (activeOrder) {
            const statusMap: Record<string, string> = {
              pending: "Pendiente por confirmar",
              confirmed: "Confirmado",
              preparing: "En preparación en cocina 👨‍🍳🔥",
              delivering: "En camino con el domiciliario 🛵💨",
            };
            const estadoDesc = statusMap[activeOrder.status] || activeOrder.status;
            replyMsg = `¡Hola! Recibimos tu llamada 📞 pero por este canal atendemos exclusivamente por chat de WhatsApp.\n\nTu pedido activo #${activeOrder.id.slice(0, 8)} se encuentra: *${estadoDesc}*.\nSi deseas consultar o modificar algún detalle, escríbenos por aquí con toda confianza. 😊`;
          } else {
            replyMsg = `¡Hola! 🥟 En Buñuelandia atendemos exclusivamente por chat de WhatsApp para tomar tus pedidos y enviártelos calienticos a domicilio 🛵✨\n\n¿En qué podemos ayudarte hoy? Cuéntanos qué se te antoja. 🤤`;
          }

          await appendMessage(incomingCall.from, "assistant", replyMsg);
          await sendDelayedOutboundWhatsApp(incomingCall.from, incomingCall.replyJid, replyMsg);
        } catch (err) {
          console.error("[evolution] error handling rejected call auto-reply:", err);
        }
      });

      return jsonOk({ call: "rejected_and_notified", id: incomingCall.id });
    }

    if (!isMessagesUpsertEvent(body)) {
      return jsonOk({ skipped: "not_upsert" });
    }

    const parsed = parseEvolutionUpsert(body);
    if (!parsed) {
      return jsonOk({ skipped: "unparseable" });
    }

    // Filtrar por lista blanca de pruebas (inbound) antes de persistir o invocar IA
    const senderTarget = parsed.digits || parsed.replyJid || parsed.from;
    const senderCheck = isPhoneWhitelisted(senderTarget);
    if (!senderCheck.allowed) {
      logWhitelistRejection("inbound", senderTarget, senderCheck.reason);
      return jsonOk({ skipped: "not_whitelisted", messageId: parsed.messageId });
    }

    if (parsed.fromMe) {
      const cmd = (parsed.text || "").trim().toLowerCase();
      if (cmd === "#pausar" || cmd === "#humano") {
        await setConversationStatus(parsed.from, "human").catch(() => {});
        await appendMessage(parsed.from, "system", "⏸️ Bot pausado manualmente desde WhatsApp móvil").catch(() => {});
        logSystemEvent("info", "agent", "Bot pausado manualmente desde WhatsApp móvil con comando #pausar", { from: parsed.from });
        return jsonOk({ manualCommand: "paused" });
      }
      if (cmd === "#bot" || cmd === "#activar") {
        await setConversationStatus(parsed.from, "bot").catch(() => {});
        await appendMessage(parsed.from, "system", "🤖 Bot reactivado desde WhatsApp móvil. Listo para responder.").catch(() => {});
        logSystemEvent("info", "agent", "Bot reactivado manualmente desde WhatsApp móvil con comando #bot", { from: parsed.from });
        return jsonOk({ manualCommand: "resumed" });
      }

      // Detectar si el mensaje es un eco de una respuesta enviada por el bot o el panel
      const text = (parsed.text || "").trim();
      const recentMsgs = await getMessages(parsed.from).catch(() => []);
      const now = Date.now();

      // Si en los últimos 90s el asistente envió un mensaje con el mismo texto, es un eco del bot/panel
      const isBotEcho = recentMsgs.slice(-5).some((m) => {
        if (m.role !== "assistant") return false;
        if (now - m.createdAt > 90_000) return false;
        if (text && m.content.trim() === text) return true;
        if (text && text.length > 10 && (m.content.includes(text) || text.includes(m.content.trim()))) return true;
        return false;
      });

      if (isBotEcho) {
        return jsonOk({ skipped: "fromMe_bot_echo" });
      }

      // Si no es un eco del bot, significa que un operador humano respondió manualmente desde WhatsApp en el celular
      const orgSettings = await getOrgSettings().catch(() => null);
      const autoPause = orgSettings?.autoPauseOnMobileReply !== "false";

      if (autoPause) {
        const conv = await getConversation(parsed.from).catch(() => null);
        const humanText = text || (parsed.isMedia ? (parsed.mediaType === "audio" ? "🎤 [Nota de voz enviada desde el móvil]" : "📸 [Archivo multimedia enviado desde el móvil]") : "[Mensaje enviado desde el móvil]");

        // Registrar el mensaje del operador en el chat del panel
        await appendMessage(parsed.from, "assistant", humanText).catch(() => {});

        if (conv?.status !== "human") {
          await setConversationStatus(parsed.from, "human").catch(() => {});
          await appendMessage(parsed.from, "system", "⏸️ Operador respondió desde el celular. Bot pausado automáticamente. Escribe #bot para reactivar.").catch(() => {});
          logSystemEvent(
            "info",
            "agent",
            "Bot pausado automáticamente por respuesta manual desde el móvil",
            { from: parsed.from, text: humanText.slice(0, 100) }
          );
        }

        return jsonOk({ manualTakeover: "auto_paused", from: parsed.from });
      }

      return jsonOk({ skipped: "fromMe" });
    }

    if (parsed.isGroup) {
      return jsonOk({ skipped: "group" });
    }

    const isImage = Boolean(parsed.isMedia && parsed.mediaType === "image");
    const isAudio = Boolean(parsed.isMedia && parsed.mediaType === "audio");
    const text = (parsed.text || "").trim();
    if (!text && !isImage && !isAudio) {
      return jsonOk({ skipped: "empty_body" });
    }

    if (parsed.messageId) {
      const claimResult = await claimWebhookEventDetailed(parsed.messageId);
      if (!claimResult.claimed) {
        return jsonOk({ skipped: claimResult.reason || "duplicate", id: parsed.messageId });
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
      isAudio,
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
      : isAudio
      ? (text ? `🎤 [Nota de voz]: "${text}"` : "🎤 [Nota de voz / Audio]")
      : text;
    const savedMsg = await appendMessage(fromKey, "user", userMessageContent);

    const orgSettings = await getOrgSettings().catch(() => null);
    if (orgSettings?.botEnabled === "false") {
      console.log("[evolution] bot is disabled via master switch — skipping auto-reply", { from: fromKey });
      if (parsed.messageId) await completeWebhookEvent(parsed.messageId);
      return jsonOk({ mode: "bot_disabled" });
    }

    if (conv.status === "human") {
      const HUMAN_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 horas de inactividad
      const isExpired = Date.now() - conv.updatedAt > HUMAN_TIMEOUT_MS;
      if (isExpired) {
        console.log("[evolution] human mode expired (>12h) — auto-reactivating bot", { from: fromKey });
        await setConversationStatus(fromKey, "bot").catch(() => {});
        await appendMessage(fromKey, "system", "🤖 Auto-reactivación: Más de 12 horas sin interacción humana. Bot reactivado.").catch(() => {});
        logSystemEvent("info", "agent", "Bot reactivado automáticamente por expiración de 12h en modo humano", { from: fromKey });
      } else {
        console.log("[evolution] human mode — skip AI", { from: fromKey });
        if (parsed.messageId) await completeWebhookEvent(parsed.messageId);
        return jsonOk({ mode: "human" });
      }
    }

    if (conv.status === "closed") {
      await setConversationStatus(fromKey, "bot").catch(() => {});
    }

    const incomingMsgTimestamp = Date.now();
    lastIncomingTimestamp.set(fromKey, incomingMsgTimestamp);

    // FAST ACK: Responder 200 OK inmediatamente (<80ms) delegando todo el procesamiento a after()
    after(async () => {
      let hasFailed = false;
      try {
        let currentText = text;

        // 1. ESPERA HUMANA NATURAL Y DEBOUNCE (1.8s a 2.5s)
        // Durante este tiempo, los ticks en WhatsApp permanecen en doble check gris (entregado pero no leído).
        if (!isImage && !isAudio && DEBOUNCE_WINDOW_MS > 0) {
          await new Promise((r) => setTimeout(r, DEBOUNCE_WINDOW_MS));
          const latestTs = lastIncomingTimestamp.get(fromKey);
          if (latestTs && latestTs > incomingMsgTimestamp) {
            console.log("[evolution] debounce: newer message arrived in burst, skipping superseded execution", { from: fromKey });
            return;
          }

          // Verificar también en base de datos si llegó un mensaje posterior durante la ventana (multiproceso / serverless)
          const convCheck = await getConversation(fromKey).catch(() => null);
          if (convCheck && convCheck.updatedAt > incomingMsgTimestamp + 150) {
            console.log("[evolution] debounce: newer message detected in DB, skipping superseded execution", { from: fromKey });
            return;
          }

          // Si llegaron varios mensajes del usuario seguidos antes de responder, agruparlos
          const allConvMsgs = await getMessages(fromKey).catch(() => []);
          const lastAssistantIdx = allConvMsgs.map((m) => m.role).lastIndexOf("assistant");
          const unhandledUserMsgs = allConvMsgs
            .slice(lastAssistantIdx >= 0 ? lastAssistantIdx + 1 : 0)
            .filter((m) => m.role === "user" && m.content && !m.content.startsWith("📷") && !m.content.startsWith("🎤"))
            .map((m) => m.content.trim())
            .filter(Boolean);

          if (unhandledUserMsgs.length > 1) {
            currentText = unhandledUserMsgs.join("\n");
            console.log("[evolution] Ráfaga de mensajes agrupada:", currentText);
          }
        } else if (isImage || isAudio) {
          // Pausa humana corta (1.8s) antes de abrir audios o fotos
          await new Promise((r) => setTimeout(r, 1800));
        }

        // 2. AHORA: El asesor "abre el chat" -> Se marca como VISTO AZUL en WhatsApp tras la espera humana
        const presenceTarget = parsed.replyJid || replyTo;
        const rawKey = (parsed.rawMsg && (parsed.rawMsg.key as Record<string, unknown>)) || null;
        const markJid = (rawKey && typeof rawKey.remoteJid === "string" ? rawKey.remoteJid : null) || presenceTarget;
        const participant = rawKey && typeof rawKey.participant === "string" ? rawKey.participant : undefined;

        if (parsed.messageId) {
          markEvolutionMessageAsRead(markJid, parsed.messageId, participant).catch(() => {});
          if (presenceTarget && presenceTarget !== markJid) {
            markEvolutionMessageAsRead(presenceTarget, parsed.messageId, participant).catch(() => {});
          }
        }

        // 3. Breve pausa humana de lectura (800ms) antes de empezar a redactar
        await new Promise((r) => setTimeout(r, 800));

        // 4. El asesor empieza a redactar: emitir presencia "Escribiendo..."
        sendEvolutionPresence(presenceTarget, "composing", 7000).catch(() => {});

        const currentConv = await getConversation(fromKey);
        if (currentConv?.status === "human") {
          console.log("[evolution] human mode — skip AI", { from: fromKey });
          return;
        }


        // SI ES NOTA DE VOZ / AUDIO: Transcribir con Gemini Multimodal / Whisper
        if (isAudio) {
          console.log("[evolution] Procesando nota de voz entrante...", { from: fromKey });
          let audioBase64 = parsed.mediaBase64;
          let audioMime = (parsed.mimeType && parsed.mimeType.toLowerCase().startsWith("audio/"))
            ? parsed.mimeType
            : "audio/ogg";

          if (!audioBase64 && parsed.messageId) {
            const fetched = await getEvolutionMediaBase64(parsed.messageId, parsed.rawMsg);
            if (fetched) {
              audioBase64 = fetched.base64;
              if (fetched.mimeType && fetched.mimeType.toLowerCase().startsWith("audio/")) {
                audioMime = fetched.mimeType;
              }
            }
          }

          console.log("[evolution audio payload]", {
            hasBase64: Boolean(audioBase64),
            length: audioBase64?.length || 0,
            mime: audioMime,
          });

          if (audioBase64) {
            const transcription = await transcribeWhatsAppAudio(audioBase64, audioMime);
            const shouldContinue = await dispatchAudioTranscriptionResult(
              transcription,
              async (transcript) => {
                currentText = transcript;
                console.log("[evolution] Transcripción exitosa", { characters: transcript.length });
                await updateMessageContent(savedMsg.id, `🎤 [Nota de voz]: "${transcript}"`).catch(() => {});
              },
              async (reason) => {
                logSystemEvent("warn", "voice", `No se pudo transcribir el audio (${reason})`, {
                  reason,
                });
                const retryReply = getAudioTranscriptionFailureReply(reason);
                await appendMessage(fromKey, "assistant", retryReply);
                try {
                  await sendDelayedOutboundWhatsApp(fromKey, replyTo, retryReply, parsed.messageId);
                } catch (err) {
                  console.error("[evolution] error sending audio retry reply", { error: safeWebhookErrorName(err) });
                }
              }
            );
            if (!shouldContinue) {
              return;
            }
          } else {
            logSystemEvent("warn", "voice", "No se pudo recuperar el archivo de audio para transcripción");
            const noAudioReply = pickRandomVariation([
              "¡Hola! Recibimos tu nota de voz 🎤 pero ocurrió un inconveniente al procesarla. Por favor escríbenos tu pedido por aquí para poder ayudarte de inmediato. 😊",
              "¡Hola! No pudimos descargar tu nota de voz en el sistema 🎤. ¿Nos podrías escribir qué te gustaría pedir hoy para agilizar tu pedido? 🥟",
              "¡Hola! Parece que el archivo de audio no se descargó correctamente 🎤. Porfa escríbenos por aquí tu pedido y con gusto te colaboramos.",
            ]);
            await appendMessage(fromKey, "assistant", noAudioReply);
            try {
              await sendDelayedOutboundWhatsApp(fromKey, replyTo, noAudioReply, parsed.messageId);
            } catch (err) {
              console.error("[evolution] error sending noAudio reply:", err);
            }
            return;
          }
        }

        // SI ES UNA IMAGEN: Intentar verificar como comprobante de pago con Gemini Visión
        if (isImage) {
          console.log("[evolution] Analizando imagen entrante...", { from: fromKey });

          let imageBase64 = parsed.mediaBase64;
          let mimeType = "image/jpeg";
          if (!imageBase64 && parsed.messageId) {
            const fetched = await getEvolutionMediaBase64(parsed.messageId, parsed.rawMsg);
            if (fetched) {
              imageBase64 = fetched.base64;
              mimeType = fetched.mimeType || "image/jpeg";
            }
          }

          // Buscar pedidos asociados a la conversación
          const allOrders = await getOrders().catch(() => []);
          const convOrders = allOrders
            .filter((o) => o.conversationId === fromKey || (conv?.phone && o.conversationId.includes(conv.phone)))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

          const latestOrder = convOrders[0];

          if (latestOrder) {
            const paymentMethod = (latestOrder.paymentMethod || "").toLowerCase();
            const isCash =
              paymentMethod.includes("efectivo") ||
              paymentMethod.includes("contra entrega") ||
              paymentMethod.includes("contraentrega");

            // 1. Si el pedido es en efectivo, conserva el flujo en efectivo (no requiere comprobante)
            if (isCash) {
              console.log("[evolution] Pedido en efectivo, no requiere comprobante", { orderId: latestOrder.id });
            } else if (
              latestOrder.status === "preparing" ||
              latestOrder.status === "delivering" ||
              latestOrder.status === "delivered"
            ) {
              // 2. Si ya fue procesado, evitar notificaciones duplicadas
              console.log("[evolution] Comprobante recibido pero el pedido ya fue verificado", {
                orderId: latestOrder.id,
                status: latestOrder.status,
              });
              const alreadyProcessedReply =
                "¡Hola! Te recordamos que el pago de tu pedido ya fue verificado exitosamente y se encuentra en proceso de preparación/entrega 🥟🛵. ¡Muchas gracias!";
              await appendMessage(fromKey, "assistant", alreadyProcessedReply);
              try {
                await sendDelayedOutboundWhatsApp(fromKey, replyTo, alreadyProcessedReply, parsed.messageId);
              } catch (err) {
                console.error("[evolution] error sending alreadyProcessed reply:", err);
              }
              return;
            } else if (latestOrder.status === "pending" || latestOrder.status === "confirmed") {
              // 3. Pedido pendiente de comprobante
              const pendingOrder = latestOrder;
              if (imageBase64) {
                const verification = await verifyReceiptWithGemini(
                  imageBase64,
                  mimeType,
                  pendingOrder.total
                );

                console.log("[evolution receipt verification]", verification);

                // Comprobar que sea comprobante legible
                if (verification.isReceipt) {
                  const detectedAmount = verification.amount ? Number(verification.amount) : null;
                  const expectedAmount = pendingOrder.total;
                  const amountMatches =
                    detectedAmount !== null &&
                    Math.abs(detectedAmount - expectedAmount) <= 1000;

                  // Antes de marcarlo como pagado, comprobar que el importe corresponda al pedido
                  if (!amountMatches) {
                    console.warn("[evolution] Comprobante con importe discrepante:", {
                      detected: detectedAmount,
                      expected: expectedAmount,
                    });

                    let mismatchReply = "";
                    if (detectedAmount !== null) {
                      mismatchReply = `Recibimos tu comprobante de pago 📸, pero el valor transferido ($${detectedAmount.toLocaleString("es-CO")} COP) no coincide con el total exacto de tu pedido ($${expectedAmount.toLocaleString("es-CO")} COP). Por favor verifica y envíanos el comprobante por el valor correcto para poder pasar tu pedido a cocina.`;
                    } else {
                      mismatchReply = `Recibimos tu comprobante de pago 📸, pero no pudimos leer con claridad el monto transferido. Por favor envíanos una captura más nítida donde sea visible el valor de $${expectedAmount.toLocaleString("es-CO")} COP para confirmarlo.`;
                    }

                    await appendMessage(fromKey, "assistant", mismatchReply);
                    try {
                      await sendDelayedOutboundWhatsApp(fromKey, replyTo, mismatchReply, parsed.messageId);
                    } catch (err) {
                      console.error("[evolution] error sending mismatch reply:", err);
                    }
                    return;
                  }

                  // Comprobante e importe correctos: marcar como preparing
                  await updateOrderStatus(pendingOrder.id, "preparing").catch((err) => {
                    console.error("[evolution] error updating order status to preparing:", err);
                  });
                  pendingOrder.status = "preparing";

                  const bankName = verification.bank || "transferencia";
                  const amountFormatted = `$${expectedAmount.toLocaleString("es-CO")} COP`;
                  const refPart = verification.reference
                    ? `\n🧾 *Aprobación / Comprobante:* #${verification.reference}`
                    : "";

                  logSystemEvent(
                    "success",
                    "payment",
                    `Comprobante verificado con éxito: ${bankName} ${amountFormatted}`,
                    { ref: verification.reference, from: fromKey, orderId: pendingOrder.id }
                  );

                  // Notificar al domiciliario que el comprobante se validó satisfactoriamente
                  const driverNotice = `✅ *PAGO VERIFICADO (#${pendingOrder.id.slice(0, 8)})*: Comprobante validado de *${pendingOrder.customerName}* por *$${expectedAmount.toLocaleString("es-CO")}*. No cobrar al entregar. 🛵`;
                  await notifyDeliveryDriver(pendingOrder, driverNotice).catch((dErr) => {
                    console.warn("[evolution] error notificando al domiciliario tras verificar comprobante:", dErr);
                  });

                  const receiptReply = `¡Comprobante de ${bankName} verificado con éxito por ${amountFormatted}! 🎉${refPart}\n\nTu pedido ya entró a preparación en cocina 👨‍🍳🔥 En unos momentos tus buñuelos estarán doraditos, crujientes y listos para salir a domicilio. ¡Muchas gracias!`;

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
              }
            }
          }
        }

        const effectiveName = parsed.pushName || conv.customerName;
        const { reply, mode, mediaUrl, invoicePdfUrl, invoiceNumber } = await handleSalesMessage(fromKey, currentText, effectiveName);
        console.log("[evolution reply processed in after]", {
          from: fromKey,
          replyTo,
          mode,
          replyLen: reply.length,
          invoicePdfUrl: !!invoicePdfUrl,
        });

        if (mode === "human_escalated") {
          await appendMessage(fromKey, "system", "⚠️ Regla activada: Escalado a agente humano").catch(() => {});
          logSystemEvent(
            "warn",
            "agent",
            `Regla activada: Escalado a agente humano (${effectiveName || fromKey})`,
            { from: fromKey, customerName: effectiveName }
          );
        }

        const latestAfterSales = await getConversation(fromKey);
        if (latestAfterSales?.status === "human") {
          console.log("[evolution] skip deferred send — human mode", { from: fromKey });
          return;
        }

        const send = await sendDelayedOutboundWhatsApp(fromKey, replyTo, reply, parsed.messageId);
        if (mediaUrl) {
          try {
            // Pausa humana antes de enviar multimedia (2.2s a 3.8s)
            const mediaDelay = 2200 + Math.floor(Math.random() * 1600);
            await new Promise((r) => setTimeout(r, mediaDelay));

            const qrCaption = pickRandomVariation([
              "📲 Aquí tienes el código QR para realizar tu pago por Nequi o Bre-B. Por favor envíanos el comprobante una vez realizado. ¡Muchas gracias!",
              "📲 Te comparto el código QR oficial de pago (Nequi / Bre-B). Cuando realices la transferencia, nos adjuntas el comprobante por aquí. 😊",
              "📲 Aquí tienes el código QR para tu transferencia bancaria. Apenas esté listo, envíanos el pantallazo para pasarlo a cocina de inmediato. 🥟✨",
            ]);

            await sendOutboundWhatsAppMedia(
              replyTo,
              mediaUrl,
              qrCaption
            );
          } catch (mErr) {
            console.error("[evolution] media outbound error", mErr);
          }
        }
        if (invoicePdfUrl) {
          try {
            // Pausa humana antes de enviar factura PDF (2.2s a 3.8s)
            const pdfDelay = 2200 + Math.floor(Math.random() * 1600);
            await new Promise((r) => setTimeout(r, pdfDelay));

            const invoiceCaption = pickRandomVariation([
              `🧾 Factura Oficial #${invoiceNumber || ""} - ¡Gracias por tu compra en Buñuelandia! 🥟`,
              `🧾 Aquí tienes tu Factura Oficial #${invoiceNumber || ""}. ¡Tus buñuelos van en preparación con todo el amor! 👨‍🍳🔥`,
              `🧾 Adjuntamos la Factura Oficial #${invoiceNumber || ""} de tu pedido. ¡Muchas gracias por preferirnos! ✨`,
            ]);

            await sendOutboundWhatsAppMedia(
              replyTo,
              invoicePdfUrl,
              invoiceCaption
            );
          } catch (pdfErr) {
            console.error("[evolution] invoice pdf outbound error", pdfErr);
          }
        }
        if (!send.ok) {
          console.error("[evolution] outbound failed", send);
          try {
            const msgs = await getMessages(fromKey);
            const lastAssistantMsg = [...msgs].reverse().find((m) => m.role === "assistant");
            if (lastAssistantMsg) {
              await updateMessageDeliveryStatus(lastAssistantMsg.id, "failed", { errorDetails: send.error });
            }
          } catch {}
        } else {
          console.log("[evolution] outbound sent", {
            from: fromKey,
            channel: send.channel,
            delayMs: send.delayMs,
            id: send.id,
          });
          try {
            const msgs = await getMessages(fromKey);
            const lastAssistantMsg = [...msgs].reverse().find((m) => m.role === "assistant");
            if (lastAssistantMsg) {
              await updateMessageDeliveryStatus(lastAssistantMsg.id, "accepted", { providerMessageId: send.id });
            }
          } catch {}
        }
      } catch (err) {
        hasFailed = true;
        console.error("[evolution] deferred background task error", err);
        if (parsed.messageId) {
          await failWebhookEvent(parsed.messageId, err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!hasFailed && parsed.messageId) {
          await completeWebhookEvent(parsed.messageId);
        }
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