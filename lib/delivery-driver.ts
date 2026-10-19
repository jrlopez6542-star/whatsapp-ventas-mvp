import {
  getOrgSettings,
  claimOrderDriverNotification,
  releaseOrderDriverNotification,
  type Order,
} from "@/lib/store";
import { sendOutboundWhatsApp } from "@/lib/whatsapp-send";
import { logSystemEvent } from "@/lib/logger";
import {
  formatCashPaymentForDriver,
  calculateCashChange,
} from "@/lib/agent/order-validator";

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
 * Formatea los productos del pedido en líneas compactas "[Cantidad] x [nombre del producto]"
 */
export function formatOrderItemsForDriver(order: Order): string[] {
  if (order.items && order.items.length > 0) {
    return order.items.map((it) => `${it.quantity || 1} x ${it.name || it.sku}`);
  }

  const raw = (order.itemsSummary || "").trim();
  if (!raw) return ["1 x Pedido"];

  const lines = raw.includes("\n")
    ? raw.split(/\r?\n/)
    : raw.split(/,\s*(?=\d+\s*x|[A-Z0-9_]+\s*x)/i);

  const formatted: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[•\-\*\s]+/, "").trim();
    if (!cleaned) continue;

    const mPrefix = cleaned.match(/^(\d+)\s*(?:x|X|\*)\s*(.+)$/);
    const mSuffix = cleaned.match(/^([^\d\nxX]+)\s*(?:x|X|\*)\s*(\d+)$/);
    if (mPrefix) {
      formatted.push(`${mPrefix[1]} x ${mPrefix[2].trim()}`);
    } else if (mSuffix) {
      formatted.push(`${mSuffix[2]} x ${mSuffix[1].trim()}`);
    } else {
      formatted.push(cleaned);
    }
  }

  return formatted.length > 0 ? formatted : [raw];
}

/**
 * Formatea la sección determinista de cobro en efectivo o electrónico
 */
function formatCobroSection(order: Order): string[] {
  const lines: string[] = ["💰 COBRO"];
  const formattedTotal = `$${(order.total || 0).toLocaleString("es-CO")}`;
  lines.push(`Total: ${formattedTotal}`);

  const paymentMethod = (order.paymentMethod || "Efectivo").trim();
  const pmLower = paymentMethod.toLowerCase();
  const isCash =
    pmLower.includes("efectivo") ||
    pmLower.includes("contra entrega") ||
    pmLower.includes("contraentrega");

  if (isCash) {
    lines.push("Método: Efectivo");
    lines.push("⚠️ Cobrar en efectivo al entregar y llevar el cambio listo");
    const rawChange = (order.changeAmount || "").trim();
    if (rawChange) {
      const calc = calculateCashChange(rawChange, order.total || 0);
      if (calc) {
        if (calc.isExact) {
          lines.push("Paga con: Monto exacto");
          lines.push("Cambio: $0");
        } else if (!calc.isInsufficient) {
          const billPrefix = rawChange.toLowerCase().includes("billete") ? "Billete de " : "";
          lines.push(`Paga con: ${billPrefix}${calc.formattedCash}`);
          lines.push(`Cambio: ${calc.formattedChange}`);
        } else {
          lines.push(`Paga con: ${rawChange}`);
        }
      } else if (
        !rawChange.toLowerCase().includes("por confirmar") &&
        rawChange !== "Paga con:"
      ) {
        lines.push(`Paga con: ${rawChange}`);
      }
    }
  } else {
    const isVerified =
      order.status === "preparing" ||
      order.status === "ready" ||
      order.status === "delivering" ||
      order.status === "delivered";

    if (isVerified) {
      lines.push(`Método: ${paymentMethod} (✅ TRANSFERENCIA VERIFICADA: Pago confirmado exitosamente. No cobrar al cliente.)`);
    } else {
      lines.push(`Método: ${paymentMethod} (⏳ *PAGO POR TRANSFERENCIA (PENDIENTE VERIFICAR COMPROBANTE):* Confirmar validación de pago antes de entregar.)`);
    }
  }

  return lines;
}

/**
 * Genera la ficha de entrega compacta formateada para el domiciliario por WhatsApp (FASE 2)
 */
export function formatDeliveryDriverMessage(
  order: Order,
  settings?: { name?: string }
): string {
  const ref = (order.invoiceNumber ? order.invoiceNumber.replace(/^#/, "") : order.id.slice(0, 8)).trim();
  const sections: string[] = [];

  // 1. Encabezado
  sections.push(`🚚 PEDIDO ${ref}`);

  // 2. CLIENTE
  const clientLines: string[] = ["CLIENTE"];
  if (order.customerName && order.customerName.trim() && order.customerName.trim().toLowerCase() !== "cliente") {
    clientLines.push(`Nombre: ${order.customerName.trim()}`);
  }
  const phoneInfo = resolveCustomerPhoneForDriver(order);
  if (phoneInfo.isLidWithoutPhone) {
    clientLines.push("Teléfono: No registrado (cuenta privada)");
  } else if (phoneInfo.displayPhone && phoneInfo.displayPhone !== "No disponible") {
    const phoneStr = phoneInfo.waUrl
      ? `${phoneInfo.displayPhone} (${phoneInfo.waUrl})`
      : phoneInfo.displayPhone;
    clientLines.push(`Teléfono: ${phoneStr}`);
  }
  if (clientLines.length > 1) {
    sections.push(clientLines.join("\n"));
  }

  // 3. 📍 ENTREGA
  const deliveryLines: string[] = ["📍 ENTREGA"];
  const address = (order.deliveryAddress || "").trim();
  const mapsMatch = address.match(/(https?:\/\/(?:maps\.google\.com|maps\.app\.goo\.gl|goo\.gl\/maps)[^\s\]]+)/i);
  const gpsLine = mapsMatch ? `\n🗺️ *Ruta GPS:* ${mapsMatch[1]}` : "";
  deliveryLines.push(`Dirección: ${address || "Por confirmar"}${gpsLine}`);
  if (order.deliveryNotes && order.deliveryNotes.trim()) {
    deliveryLines.push(`Referencia: ${order.deliveryNotes.trim()}`);
  }
  sections.push(deliveryLines.join("\n"));

  // 4. 🛍️ PEDIDO
  const items = formatOrderItemsForDriver(order);
  const pedidoLines: string[] = ["🛍️ PEDIDO", ...items];
  const obs = (order as any).observation || (order as any).orderNotes;
  if (obs && typeof obs === "string" && obs.trim()) {
    pedidoLines.push(`Observación: ${obs.trim()}`);
  }
  sections.push(pedidoLines.join("\n"));

  // 5. 💰 COBRO
  const cobroLines = formatCobroSection(order);
  sections.push(cobroLines.join("\n"));

  // 6. 🧾 FACTURA (enlace oficial existente una sola vez)
  const invoiceUrl =
    order.invoiceUrl ||
    (order.invoiceId
      ? `https://contabilidad-app-fawn.vercel.app/api/invoices/public/${order.invoiceId}`
      : undefined);
  if (invoiceUrl) {
    sections.push(`🧾 FACTURA\n${invoiceUrl}`);
  }

  // 7. ✅ AL CONFIRMAR
  const pmLower = (order.paymentMethod || "Efectivo").toLowerCase();
  const isCash =
    pmLower.includes("efectivo") ||
    pmLower.includes("contra entrega") ||
    pmLower.includes("contraentrega");
  if (isCash) {
    sections.push(`✅ AL CONFIRMAR\nEnvía: "PAGADO ${ref}"`);
  }

  return sections.join("\n\n");
}

// Deduplication cache: key = `${order.id}:${kind}` -> timestamp
const notifiedDriversCache = new Map<string, number>();
const NOTIFY_DEDUPE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Notifica automáticamente al domiciliario asignado si tiene teléfono configurado
 */
export async function notifyDeliveryDriver(
  order: Order,
  customMessage?: string,
  options?: { force?: boolean }
): Promise<{ ok: boolean; error?: string; sentTo?: string; message: string; skipped?: string }> {
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

  const kind = customMessage && customMessage.includes("PAGO VERIFICADO") ? "verified" : "initial";
  const dedupeKey = `${order.id}:${kind}`;
  const now = Date.now();

  // 1. Reclamo condicional atómico en base de datos y memoria
  if (!options?.force) {
    const lastSent = notifiedDriversCache.get(dedupeKey);
    if (lastSent && now - lastSent < NOTIFY_DEDUPE_TTL_MS) {
      console.log(`[delivery-driver] Notificación (${kind}) en caché local de deduplicación, omitiendo pedido #${order.id.slice(0, 8)}.`);
      return {
        ok: true,
        sentTo: driverPhone,
        message,
        skipped: "duplicate",
      };
    }

    const claimed = await claimOrderDriverNotification(order.id, kind, false, order);
    if (!claimed) {
      console.log(`[delivery-driver] Notificación (${kind}) ya reclamada o enviada previamente en BD para pedido #${order.id.slice(0, 8)}, omitiendo duplicado.`);
      return {
        ok: true,
        sentTo: driverPhone,
        message,
        skipped: "duplicate",
      };
    }
  } else {
    await claimOrderDriverNotification(order.id, kind, true, order);
  }

  try {
    const res = await sendOutboundWhatsApp(driverPhone, message);
    if (!res.ok) {
      // Revertir el reclamo en base de datos para permitir reintentos posteriores
      await releaseOrderDriverNotification(order.id, kind, false, order);
      notifiedDriversCache.delete(dedupeKey);

      console.warn("[delivery-driver] Error enviando WhatsApp al domiciliario:", res.error);
      logSystemEvent("warn", "driver", `Error enviando WhatsApp al domiciliario para pedido #${order.id.slice(0, 8)}: ${res.error}`, {
        orderId: order.id,
        error: res.error,
        kind,
      });
      return { ok: false, error: res.error, sentTo: driverPhone, message };
    }

    // Confirmar reclamo exitoso en base de datos y memoria
    await releaseOrderDriverNotification(order.id, kind, true, order);
    notifiedDriversCache.set(dedupeKey, Date.now());

    console.log("[delivery-driver] Ficha enviada exitosamente al domiciliario:", driverPhone);
    logSystemEvent("success", "driver", `Ficha de pedido #${order.id.slice(0, 8)} (${kind}) enviada al domiciliario`, {
      orderId: order.id,
      total: order.total,
      address: order.deliveryAddress,
      kind,
    });
    return { ok: true, sentTo: driverPhone, message };
  } catch (err) {
    // Revertir el reclamo en base de datos ante excepción
    await releaseOrderDriverNotification(order.id, kind, false, order);
    notifiedDriversCache.delete(dedupeKey);

    console.error("[delivery-driver] Excepción al notificar al domiciliario:", err);
    logSystemEvent("error", "driver", `Excepción al notificar al domiciliario para pedido #${order.id.slice(0, 8)}: ${String(err)}`, {
      orderId: order.id,
      error: String(err),
      kind,
    });
    return { ok: false, error: String(err), sentTo: driverPhone, message };
  }
}
