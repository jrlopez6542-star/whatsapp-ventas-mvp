import type { Message, Order } from "@/lib/store";

/**
 * Aísla la sesión conversacional activa cortando los mensajes anteriores a un pedido finalizado/cancelado
 * o a un mensaje de reinicio/cancelación explícito del cliente o asistente.
 */
export function getSessionMessages(rawMessages: Message[], latestOrder?: Order | null): Message[] {
  const msgs = [...rawMessages];

  // Detectar punto de reinicio por confirmación de pedido anterior, cancelación o nuevo pedido dentro del historial
  let resetIndex = -1;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const c = (m.content || "").toLowerCase();
    if (m.role === "assistant") {
      if (
        c.includes("hemos cancelado tu solicitud de pedido") ||
        c.includes("ha sido cancelado con éxito") ||
        c.includes("con muchísimo gusto te tomamos un nuevo pedido") ||
        c.includes("con muchisimo gusto te tomamos un nuevo pedido") ||
        c.includes("pedido confirmado") ||
        c.includes("pedido registrado") ||
        c.includes("hemos registrado tu pedido")
      ) {
        resetIndex = i;
      }
    } else if (m.role === "user") {
      if (
        /\b(?:para\s+)?cancelar\s+(?:el\s+|mi\s+)?(?:pedido|orden)\b/i.test(c) ||
        /\b(?:nuevo\s+pedido|otro\s+pedido|pedir\s+de\s+nuevo|otra\s+orden|nueva\s+orden|hola\s+para\s+un\s+pedido|para\s+un\s+pedido)\b/i.test(c)
      ) {
        resetIndex = i;
      }
    }
  }

  if (resetIndex >= 0 && resetIndex < msgs.length - 1) {
    return msgs.slice(resetIndex + 1);
  }

  if (latestOrder?.createdAt) {
    const orderTime = latestOrder.createdAt;
    let lastOrderMsgIndex = -1;
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].createdAt <= orderTime) {
        lastOrderMsgIndex = i;
      }
    }
    if (
      lastOrderMsgIndex >= 0 &&
      lastOrderMsgIndex < msgs.length - 1 &&
      (Date.now() - orderTime > 45 * 60 * 1000 ||
        latestOrder.status === "delivered" ||
        latestOrder.status === "cancelled" ||
        latestOrder.status === "ready" ||
        latestOrder.status === "delivering" ||
        latestOrder.status === "confirmed" ||
        latestOrder.status === "preparing")
    ) {
      return msgs.slice(lastOrderMsgIndex + 1);
    }
  }

  return msgs;
}

function normalizeConfirmationText(value: string): string {
  return value
    .replace(/^🎤\s*\[Nota de voz(?: transcrita)?\]:\s*"?/i, "")
    .replace(/"?\s*$/i, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?¿¡]+$/g, "");
}

function isExplicitConfirmation(value: string): boolean {
  return [
    "1",
    "1️⃣",
    "si",
    "sí",
    "confirmar",
    "confirmar pedido",
    "confirmo",
    "confirmado",
    "dale",
    "de una",
    "correcto",
  ].includes(normalizeConfirmationText(value));
}

function isOrderSummary(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("resumen de tu pedido") ||
    lower.includes("1️⃣ ✅ confirmar pedido") ||
    (lower.includes("1️⃣") && (lower.includes("confirmar") || lower.includes("modificar")))
  );
}

/**
 * Autoriza la creación únicamente cuando el último mensaje del agente es un resumen
 * y el único mensaje del cliente posterior a ese resumen es su confirmación explícita.
 */
export function getValidOrderConfirmationSummary(messages: Message[], currentUserText: string): Message | null {
  if (!isExplicitConfirmation(currentUserText)) return null;

  let summaryIndex = -1;
  let lastAssistantIndex = -1;
  let lastUserIndex = -1;
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role === "assistant") {
      lastAssistantIndex = i;
      if (isOrderSummary(message.content || "")) summaryIndex = i;
    } else if (message.role === "user") {
      lastUserIndex = i;
    }
  }

  if (summaryIndex < 0 || lastAssistantIndex !== summaryIndex || lastUserIndex <= summaryIndex) {
    return null;
  }

  const summary = messages[summaryIndex];
  if (summary.deliveryStatus !== "accepted" && summary.deliveryStatus !== "delivered") {
    return null;
  }

  const userMessagesAfterSummary = messages
    .slice(summaryIndex + 1)
    .filter((message) => message.role === "user");
  if (userMessagesAfterSummary.length !== 1) return null;

  return normalizeConfirmationText(messages[lastUserIndex].content || "") ===
    normalizeConfirmationText(currentUserText)
    ? summary
    : null;
}

export function hasValidOrderConfirmation(messages: Message[], currentUserText: string): boolean {
  return getValidOrderConfirmationSummary(messages, currentUserText) !== null;
}
