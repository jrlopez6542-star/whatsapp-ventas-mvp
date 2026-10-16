import { getOrgSettings, type Order } from "@/lib/store";
import { sendOutboundWhatsApp } from "@/lib/whatsapp-send";
import { logSystemEvent } from "@/lib/logger";

function formatCop(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export interface CustomerPhoneInfo {
  displayPhone: string;
  waUrl?: string;
  isLidWithoutPhone: boolean;
}

export function formatColombianPhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (digits.length === 12 && digits.startsWith("573")) {
    const ten = digits.slice(2);
    return `${ten.slice(0, 3)} ${ten.slice(3, 6)} ${ten.slice(6)}`;
  }
  return null;
}

export function resolveCustomerPhoneForDriver(order: Order): CustomerPhoneInfo {
  // 1. Número registrado explícitamente en order.customerPhone
  if (order.customerPhone) {
    const raw = order.customerPhone.trim();
    const isRawLid = raw.toLowerCase().includes("lid:") || raw.toLowerCase().includes("@lid");
    if (!isRawLid) {
      const formatted = formatColombianPhone(raw);
      if (formatted) {
        const ten = raw.replace(/\D/g, "").slice(-10);
        return {
          displayPhone: formatted,
          waUrl: `https://wa.me/57${ten}`,
          isLidWithoutPhone: false,
        };
      }
      const digits = raw.replace(/\D/g, "");
      if (digits.length >= 8 && digits.length <= 13) {
        return {
          displayPhone: `+${digits}`,
          waUrl: `https://wa.me/${digits}`,
          isLidWithoutPhone: false,
        };
      }
    }
  }

  // 2. Extraer número de celular colombiano presente en dirección o notas de entrega
  const textToScan = `${order.deliveryAddress || ""} ${order.deliveryNotes || ""}`;
  const phoneMatch = textToScan.match(
    /(?:(?:cel(?:ular)?|tel(?:[eé]fono)?|wpp|whatsapp|contacto|llamar(?:\s+al)?)\s*[:#\-]?\s*)?(?:\+?57[\s.-]?)?(3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})\b/i
  );
  if (phoneMatch && phoneMatch[1]) {
    const ten = phoneMatch[1].replace(/\D/g, "");
    if (ten.length === 10 && ten.startsWith("3")) {
      const formatted = `${ten.slice(0, 3)} ${ten.slice(3, 6)} ${ten.slice(6)}`;
      return {
        displayPhone: formatted,
        waUrl: `https://wa.me/57${ten}`,
        isLidWithoutPhone: false,
      };
    }
  }

  // 3. Evaluar el identificador de la conversación
  const rawConv = (order.conversationId || "").trim();
  const isLid = rawConv.toLowerCase().includes("lid:") || rawConv.toLowerCase().includes("@lid");

  if (isLid) {
    return {
      displayPhone: "⚠️ No registrado (Cuenta privada)",
      waUrl: undefined,
      isLidWithoutPhone: true,
    };
  }

  const digits = rawConv.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("573")) {
    const ten = digits.slice(2);
    return {
      displayPhone: `${ten.slice(0, 3)} ${ten.slice(3, 6)} ${ten.slice(6)}`,
      waUrl: `https://wa.me/57${ten}`,
      isLidWithoutPhone: false,
    };
  }
  if (digits.length === 10 && digits.startsWith("3")) {
    return {
      displayPhone: `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`,
      waUrl: `https://wa.me/57${digits}`,
      isLidWithoutPhone: false,
    };
  }
  if (digits.length >= 8 && digits.length <= 13) {
    return {
      displayPhone: `+${digits}`,
      waUrl: `https://wa.me/${digits}`,
      isLidWithoutPhone: false,
    };
  }

  return {
    displayPhone: "No disponible",
    waUrl: undefined,
    isLidWithoutPhone: false,
  };
}

/**
 * Genera la ficha de entrega formateada para el domiciliario por WhatsApp
 */
export function formatDeliveryDriverMessage(
  order: Order,
  settings?: { name?: string }
): string {
  const businessName = settings?.name || "BUÑUELANDIA";
  const phoneInfo = resolveCustomerPhoneForDriver(order);

  let phoneBlock = "";
  if (phoneInfo.isLidWithoutPhone) {
    phoneBlock =
      `📱 *Celular:* ⚠️ No registrado (Cuenta privada de WhatsApp)\n` +
      `💬 *WhatsApp:* Responder por el chat del panel de ventas\n\n`;
  } else if (phoneInfo.waUrl) {
    phoneBlock =
      `📱 *Celular:* ${phoneInfo.displayPhone}\n` +
      `💬 *WhatsApp:* ${phoneInfo.waUrl}\n\n`;
  } else {
    phoneBlock =
      `📱 *Celular:* ${phoneInfo.displayPhone}\n\n`;
  }

  const paymentMethod = order.paymentMethod || "Por confirmar";
  const isCash =
    paymentMethod.toLowerCase().includes("efectivo") ||
    paymentMethod.toLowerCase().includes("contra entrega") ||
    paymentMethod.toLowerCase().includes("contraentrega");

  let paymentNotice = "";
  if (isCash) {
    paymentNotice = "⚠️ *ATENCIÓN:* Cobrar en efectivo al entregar y llevar el cambio listo 💵";
  } else {
    const isVerified =
      order.status === "preparing" ||
      order.status === "delivering" ||
      order.status === "delivered";

    if (isVerified) {
      paymentNotice = "✅ *TRANSFERENCIA VERIFICADA:* Pago confirmado exitosamente. No cobrar al cliente.";
    } else {
      paymentNotice = "⏳ *PAGO POR TRANSFERENCIA (PENDIENTE VERIFICAR COMPROBANTE):* Confirmar validación de pago antes de entregar.";
    }
  }

  const invoiceLine = order.invoiceNumber
    ? `🧾 *Factura Oficial:* #${order.invoiceNumber}\n`
    : "";

  const notesLine = order.deliveryNotes
    ? `🏢 *Notas / Portería:* ${order.deliveryNotes}\n`
    : "";

  const changeLine = order.changeAmount
    ? `💵 *Paga con:* ${order.changeAmount}\n`
    : "";

  const address = order.deliveryAddress || "Dirección por confirmar";
  const mapsMatch = address.match(/(https?:\/\/(?:maps\.google\.com|maps\.app\.goo\.gl|goo\.gl\/maps)[^\s\]]+)/i);
  const gpsLine = mapsMatch ? `\n🗺️ *Ruta GPS:* ${mapsMatch[1]}` : "";

  return (
    `🛵 *¡NUEVO DOMICILIO ASIGNADO! - ${businessName}* 🥟🔥\n\n` +
    `📋 *Pedido:* #${order.id.slice(0, 8)}\n` +
    invoiceLine +
    `👤 *Cliente:* ${order.customerName || "Cliente"}\n` +
    phoneBlock +
    `📍 *Dirección de Entrega:*\n` +
    `👉 ${address}${gpsLine}\n` +
    notesLine +
    `\n🛒 *Detalle del Pedido:*\n` +
    `${order.itemsSummary || "Productos ordenados"}\n\n` +
    `💰 *TOTAL A COBRAR / PAGADO:*\n` +
    `💵 *${formatCop(order.total || 0)}*\n` +
    `💳 *Medio de Pago:* ${paymentMethod}\n` +
    changeLine +
    `\n${paymentNotice}\n\n` +
    `¡Buen viaje y maneja con precaución! 🛵💨`
  );
}

/**
 * Notifica automáticamente al domiciliario asignado si tiene teléfono configurado
 */
export async function notifyDeliveryDriver(
  order: Order,
  customMessage?: string
): Promise<{ ok: boolean; error?: string; sentTo?: string; message: string }> {
  const settings = await getOrgSettings().catch(() => null);
  const driverPhone = settings?.deliveryDriverPhone?.trim();
  const notifyEnabled = settings?.deliveryDriverNotifyEnabled !== "false";

  const message = customMessage || formatDeliveryDriverMessage(order, settings || undefined);

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
      logSystemEvent("warn", "driver", `Error enviando WhatsApp al domiciliario (${driverPhone}): ${res.error}`);
      return { ok: false, error: res.error, sentTo: driverPhone, message };
    }
    console.log("[delivery-driver] Ficha enviada exitosamente al domiciliario:", driverPhone);
    logSystemEvent("success", "driver", `Ficha de pedido #${order.id.slice(0, 8)} enviada al domiciliario (${driverPhone})`, {
      orderId: order.id,
      total: order.total,
      address: order.deliveryAddress,
    });
    return { ok: true, sentTo: driverPhone, message };
  } catch (err) {
    console.error("[delivery-driver] Excepción al notificar al domiciliario:", err);
    logSystemEvent("error", "driver", `Excepción al notificar al domiciliario: ${String(err)}`);
    return { ok: false, error: String(err), sentTo: driverPhone, message };
  }
}
