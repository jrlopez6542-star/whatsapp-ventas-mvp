import { getOrgSettings, type Order } from "@/lib/store";
import { sendOutboundWhatsApp } from "@/lib/whatsapp-send";

function formatCop(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Genera la ficha de entrega formateada para el domiciliario por WhatsApp
 */
export function formatDeliveryDriverMessage(
  order: Order,
  settings?: { name?: string }
): string {
  const businessName = settings?.name || "BUÑUELANDIA";
  const rawPhone = order.conversationId || "";
  const cleanPhone = rawPhone.replace(/\D/g, "");
  const waLink = cleanPhone ? `https://wa.me/${cleanPhone}` : "No disponible";

  const paymentMethod = order.paymentMethod || "Por confirmar";
  const isCash =
    paymentMethod.toLowerCase().includes("efectivo") ||
    paymentMethod.toLowerCase().includes("contra entrega") ||
    paymentMethod.toLowerCase().includes("contraentrega");

  const cashNotice = isCash
    ? "⚠️ *ATENCIÓN:* Cobrar en efectivo al entregar y llevar el cambio listo 💵"
    : "✅ *YA PAGADO / TRANSFERENCIA:* No cobrar productos al cliente.";

  const invoiceLine = order.invoiceNumber
    ? `🧾 *Factura Oficial:* #${order.invoiceNumber}\n`
    : "";

  const notesLine = order.deliveryNotes
    ? `🏢 *Notas / Portería:* ${order.deliveryNotes}\n`
    : "";

  const changeLine = order.changeAmount
    ? `💵 *Paga con:* ${order.changeAmount}\n`
    : "";

  return (
    `🛵 *¡NUEVO DOMICILIO ASIGNADO! - ${businessName}* 🥟🔥\n\n` +
    `📋 *Pedido:* #${order.id.slice(0, 8)}\n` +
    invoiceLine +
    `👤 *Cliente:* ${order.customerName || "Cliente"}\n` +
    `📱 *WhatsApp:* ${waLink} (${cleanPhone || "Chat"})\n\n` +
    `📍 *Dirección de Entrega:*\n` +
    `👉 ${order.deliveryAddress || "Dirección por confirmar"}\n` +
    notesLine +
    `\n🛒 *Detalle del Pedido:*\n` +
    `${order.itemsSummary || "Productos ordenados"}\n\n` +
    `💰 *TOTAL A COBRAR / PAGADO:*\n` +
    `💵 *${formatCop(order.total || 0)}*\n` +
    `💳 *Medio de Pago:* ${paymentMethod}\n` +
    changeLine +
    `\n${cashNotice}\n\n` +
    `¡Buen viaje y maneja con precaución! 🛵💨`
  );
}

/**
 * Notifica automáticamente al domiciliario asignado si tiene teléfono configurado
 */
export async function notifyDeliveryDriver(
  order: Order
): Promise<{ ok: boolean; error?: string; sentTo?: string; message: string }> {
  const settings = await getOrgSettings().catch(() => null);
  const driverPhone = settings?.deliveryDriverPhone?.trim();
  const notifyEnabled = settings?.deliveryDriverNotifyEnabled !== "false";

  const message = formatDeliveryDriverMessage(order, settings || undefined);

  if (!driverPhone) {
    return {
      ok: false,
      error: "No hay teléfono de domiciliario configurado",
      message,
    };
  }

  if (!notifyEnabled) {
    return {
      ok: false,
      error: "La notificación automática al domiciliario está desactivada",
      sentTo: driverPhone,
      message,
    };
  }

  try {
    const res = await sendOutboundWhatsApp(driverPhone, message);
    if (!res.ok) {
      console.warn("[delivery-driver] Error enviando WhatsApp al domiciliario:", res.error);
      return { ok: false, error: res.error, sentTo: driverPhone, message };
    }
    console.log("[delivery-driver] Ficha enviada exitosamente al domiciliario:", driverPhone);
    return { ok: true, sentTo: driverPhone, message };
  } catch (err) {
    console.error("[delivery-driver] Excepción al notificar al domiciliario:", err);
    return { ok: false, error: String(err), sentTo: driverPhone, message };
  }
}
