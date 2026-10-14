import {
  appendMessage,
  createOrder,
  getMessages,
  getOrders,
  getOrgSettings,
  getProducts,
  setConversationStatus,
  setConversationCustomerName,
  updateOrderInvoice,
  type Message,
  type Product,
} from "@/lib/store";
import { createInvoiceInContabilidad } from "@/lib/contabilidad";
import { notifyDeliveryDriver } from "@/lib/delivery-driver";
import { logSystemEvent } from "@/lib/logger";

export interface SalesMessageResult {
  reply: string;
  mode: "ai" | "keyword" | "human_escalated" | "order_created";
  mediaUrl?: string;
  mediaCaption?: string;
  invoiceUrl?: string;
  invoicePdfUrl?: string;
  invoiceNumber?: string;
}

function formatCop(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Limpia y valida candidatos a dirección excluyendo palabras genéricas o de medios de pago
function cleanAddressCandidate(cand: string): string | null {
  if (!cand) return null;
  let clean = cand.trim().replace(/^[:,\s.-]+|[:,\s.-]+$/g, "");
  // Eliminar prefijos verbales y conectores comunes: "en el", "para la", "vivo en", "entregar en", etc.
  clean = clean.replace(/^(?:(?:vivo|estoy|queda|es)\s+en\s+|(?:entregar|despachar|enviar|llevar)\s+(?:en|a)?\s*|(?:en|para|a|al|por)\s+(?:el\s+|la\s+|los\s+|las\s+)?|(?:el|la|los|las)\s+)/i, "").trim();

  const lower = clean.toLowerCase();
  if (
    lower.includes("indicada en chat") ||
    lower.includes("no especificada") ||
    lower.includes("por confirmar") ||
    lower.includes("ingresada") ||
    lower.includes("ninguna") ||
    lower.includes("gracias") ||
    lower.includes("buñuelo") ||
    lower.includes("caja")
  ) {
    return null;
  }
  if (
    lower === "nequi" ||
    lower === "bre-b" ||
    lower === "breb" ||
    lower === "efectivo" ||
    lower === "transferencia" ||
    lower === "daviplata" ||
    lower === "bancolombia"
  ) {
    return null;
  }
  return clean.length >= 4 ? clean : null;
}

// Extrae direcciones colombianas con soporte integral urbano, rural, veredas y conjuntos residenciales
function extractAddress(text: string): string | null {
  if (!text) return null;

  // Normalizar saltos de línea y limpiar caracteres de formato WhatsApp (*, _, ~, `)
  const cleanText = text.replace(/[*_~`]/g, " ").trim();
  const lines = cleanText.split(/[\r\n]+/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1. Etiqueta directa en la línea: "Dirección: Cra 3a 7 26", "Enviar a: Vereda La Balsa", "Vivo en: Conjunto Puertas del Sol", etc.
    const labeledMatch = trimmed.match(
      /(?:📍\s*)?(?:(?:mi\s+)?direcci[oó]n(?:\s+es)?|enviar\s+a|despachar\s+(?:a|en)|entregar?\s+(?:a|en|para)|lugar\s+de\s+entrega|destino|vivo\s+en|estoy\s+en|queda\s+en|es\s+en|es\s+para(?:\s+la|\s+el)?|para\s+la|para\s+el|para)[:\s]+([^,;\n]+(?:[,;][^,;\n]+)*)/i
    );
    if (labeledMatch && labeledMatch[1]) {
      const cand = cleanAddressCandidate(labeledMatch[1]);
      if (cand) return cand;
    }

    // 2. Veredas, fincas, haciendas, corregimientos y zonas rurales
    // Cubre: "vereda la balsa", "vereda tal", "vereda el rosal finca la florida", "finca el recreo vereda chimbi", "vda centro", "km 5 vía...", etc.
    const ruralRegex =
      /\b(?:vereda|vda\.?|corregimiento|correg\.?|inspecci[oó]n)\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s]+(?:\s+(?:sector|finca|lote|predio|parcela|casa|km|kil[oó]metro|entrada|escuela|colegio|frente\s+a|diagonal\s+a)\b[^.,;\n]*)?|\b(?:finca|granja|hacienda)\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s]+(?:\s+(?:vereda|vda\.?|sector|km|kil[oó]metro)\b[^.,;\n]*)?|\b(?:km\.?|kil[oó]metro)\s*\d+[^.,;\n]+|\b(?:v[ií]a|carretera|autopista)\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+(?:\s+(?:km\.?|kil[oó]metro)\s*\d+[^.,;\n]*)?/i;
    const ruralMatch = trimmed.match(ruralRegex);
    if (ruralMatch) {
      const cand = cleanAddressCandidate(ruralMatch[0]);
      if (cand) return cand;
    }

    // 3. Conjuntos residenciales, condominios, urbanizaciones, edificios, reservas, ciudadelas, portales, etc.
    // Cubre: "conjunto puertas del sol", "conjunto residencial las palmas torre 3 apto 201", "condominio campestre el peñon", "urbanizacion los sauces", etc.
    const complexRegex =
      /\b(?:conjunto(?:\s+residencial)?|condominio(?:\s+campestre)?|urbanizaci[oó]n|urb\.?|edificio|edif\.?|edf\.?|ciudadela|reserva(?:\s+campestre)?|altos\s+de(?:l)?|portales?\s+de(?:l)?|bosques?\s+de(?:l)?|parques?\s+de(?:l)?|villas?\s+de(?:l)?|terrazas?\s+de(?:l)?|balcones?\s+de(?:l)?|colinas?\s+de(?:l)?|prados?\s+de(?:l)?|jardines?\s+de(?:l)?|miradores?\s+de(?:l)?|rinc[oó]n\s+de(?:l)?|parcelaci[oó]n)\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s]+(?:\s+(?:torre|bloque|etapa|agrupaci[oó]n|interior|int\.?|apto|apartamento|casa|mz|manzana|lote|piso|oficina|of\.?|porter[ií]a|barrio|sector)\b[^.,;\n]*)?/i;
    const complexMatch = trimmed.match(complexRegex);
    if (complexMatch) {
      const cand = cleanAddressCandidate(complexMatch[0]);
      if (cand) return cand;
    }

    // 4. Nomenclatura urbana colombiana completa
    // Cubre: Calle, Cll, Cl, Carrera, Cra, Cr, Kra, Kr, K, Diagonal, Diag, Dg, Transversal, Trans, Tv, Avenida, Av, Ave, Autopista, Circular, Circunvalar
    const streetRegex =
      /\b(?:calle|cll|cl|c\/|carrera|cra|cr|kra|kr|k|diagonal|diag|dg|transversal|trans|tv|avenida|av|ave|autopista|auto|circular|circ|circunvalar)\.?\s+\d+[a-zA-Z]?(?:\s+(?:bis|este|sur|norte|oeste))?\s*(?:#|no\.?|nro\.?|num\.?|número|°|con|\s)\s*\d+[a-zA-Z]?(?:\s+(?:bis|este|sur|norte|oeste))?\s*[-–—\s]\s*\d+[a-zA-Z]?(?:\s+(?:sur|norte|este|oeste))?(?:\s*(?:apto|apartamento|int|interior|torre|bloque|casa|mz|manzana|lote|lt|barrio|piso|oficina|of|conjunto|edificio)\b[^.,;\n]*)?/i;
    const streetMatch = trimmed.match(streetRegex);
    if (streetMatch) {
      const cand = cleanAddressCandidate(streetMatch[0]);
      if (cand) return cand;
    }

    // 5. Intersecciones colombianas (ej: "Calle 53 con 13", "Cra 7 con Calle 45")
    const intersectionRegex =
      /\b(?:calle|cll|cl|carrera|cra|cr|kra|kr|diagonal|diag|dg|transversal|trans|tv|avenida|av)\s+\d+[a-zA-Z]?(?:\s+(?:bis|este|sur|norte|oeste))?\s+con\s+(?:calle|cll|cl|carrera|cra|cr|kra|kr|\d+)\s*\d*[a-zA-Z]?(?:\s*(?:barrio|esquina|apto|torre|casa)\b[^.,;\n]*)?/i;
    const interMatch = trimmed.match(intersectionRegex);
    if (interMatch) {
      const cand = cleanAddressCandidate(interMatch[0]);
      if (cand) return cand;
    }

    // 6. Manzanas y Lotes (ej: "Manzana B Casa 14", "Mz 5 Lote 12 Barrio La Granja")
    const mzRegex =
      /\b(?:manzana|mz\.?|mza\.?)\s*[a-zA-Z0-9]+(?:\s+(?:casa|cs\.?|lote|lt\.?)\s*[a-zA-Z0-9]+)(?:\s+(?:barrio|etapa|sector)\b[^.,;\n]*)?/i;
    const mzMatch = trimmed.match(mzRegex);
    if (mzMatch) {
      const cand = cleanAddressCandidate(mzMatch[0]);
      if (cand) return cand;
    }
  }

  // 7. Búsqueda en texto continuo si no coincidió por líneas separadas
  const labeledAll = cleanText.match(
    /(?:(?:mi\s+)?direcci[oó]n(?:\s+es)?|enviar\s+a|despachar\s+(?:a|en)|entregar?\s+(?:a|en|para)|lugar\s+de\s+entrega|destino|vivo\s+en|estoy\s+en|queda\s+en|es\s+en|es\s+para(?:\s+la|\s+el)?|para\s+la|para\s+el|para)[:\s]+([^,;\n]+(?:[,;][^,;\n]+)*)/i
  );
  if (labeledAll && labeledAll[1]) {
    const cand = cleanAddressCandidate(labeledAll[1]);
    if (cand) return cand;
  }

  const ruralAll = cleanText.match(
    /\b(?:vereda|vda\.?)\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s]+(?:\s+(?:sector|finca|lote|predio|parcela|casa|km|kil[oó]metro|entrada|escuela|colegio|frente\s+a|diagonal\s+a)\b[^.,;\n]*)?/i
  );
  if (ruralAll) {
    const cand = cleanAddressCandidate(ruralAll[0]);
    if (cand) return cand;
  }

  const complexAll = cleanText.match(
    /\b(?:conjunto(?:\s+residencial)?|condominio(?:\s+campestre)?|urbanizaci[oó]n|urb\.?|edificio|edif\.?|edf\.?|ciudadela|reserva(?:\s+campestre)?|altos\s+de(?:l)?|portales?\s+de(?:l)?|bosques?\s+de(?:l)?|parques?\s+de(?:l)?|villas?\s+de(?:l)?|terrazas?\s+de(?:l)?|balcones?\s+de(?:l)?|colinas?\s+de(?:l)?|prados?\s+de(?:l)?|jardines?\s+de(?:l)?|miradores?\s+de(?:l)?|rinc[oó]n\s+de(?:l)?|parcelaci[oó]n)\s+[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s]+(?:\s+(?:torre|bloque|etapa|agrupaci[oó]n|interior|int\.?|apto|apartamento|casa|mz|manzana|lote|piso|oficina|of\.?|porter[ií]a|barrio|sector)\b[^.,;\n]*)?/i
  );
  if (complexAll) {
    const cand = cleanAddressCandidate(complexAll[0]);
    if (cand) return cand;
  }

  const streetAll = cleanText.match(
    /\b(?:calle|cll|cl|c\/|carrera|cra|cr|kra|kr|k|diagonal|diag|dg|transversal|trans|tv|avenida|av|ave|autopista|auto|circular|circ|circunvalar)\.?\s+\d+[a-zA-Z]?(?:\s+(?:bis|este|sur|norte|oeste))?\s*(?:#|no\.?|nro\.?|num\.?|número|°|con|\s)\s*\d+[a-zA-Z]?(?:\s+(?:bis|este|sur|norte|oeste))?\s*[-–—\s]\s*\d+[a-zA-Z]?(?:\s+(?:sur|norte|este|oeste))?(?:\s*(?:apto|apartamento|int|interior|torre|bloque|casa|mz|manzana|lote|lt|barrio|piso|oficina|of|conjunto|edificio)\b[^.,;\n]*)?/i
  );
  if (streetAll) {
    const cand = cleanAddressCandidate(streetAll[0]);
    if (cand) return cand;
  }

  return null;
}

// Extrae medio de pago colombiano
function extractPaymentMethod(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("nequi")) return "Nequi";
  if (lower.includes("breb") || lower.includes("bre-b") || lower.includes("bre b")) return "Bre-B";
  if (lower.includes("efectivo") || lower.includes("contra entrega") || lower.includes("contraentrega")) return "Efectivo contra entrega";
  if (lower.includes("daviplata")) return "Daviplata";
  if (lower.includes("bancolombia") || lower.includes("transferencia")) return "Transferencia Bancaria";
  return null;
}

// Verifica si el cliente o la respuesta hace referencia a pagar por Nequi o Bre-B (o QR/transferencia)
function shouldSendTransferQr(userText: string, assistantReply: string): boolean {
  const u = (userText || "").toLowerCase().trim();
  const a = (assistantReply || "").toLowerCase();

  // Si el usuario eligió efectivo o la confirmación indica efectivo, JAMÁS enviar QR
  if (
    a.includes("efectivo contra entrega") ||
    a.includes("medio de pago: efectivo") ||
    u.includes("efectivo") ||
    u.includes("contra entrega") ||
    u.includes("contraentrega") ||
    u === "3" ||
    u.startsWith("3.") ||
    u.startsWith("3 ")
  ) {
    return false;
  }

  // 1. El usuario seleccionó explícitamente Nequi, Bre-B o QR
  const userExplicitlySelectedQr =
    u.includes("nequi") ||
    u.includes("bre-b") ||
    u.includes("breb") ||
    u.includes("bre b") ||
    u.includes("transferencia") ||
    u.includes("código qr") ||
    u.includes("codigo qr") ||
    /\bqr\b/i.test(u) ||
    u === "1" ||
    u === "2" ||
    u.startsWith("1.") ||
    u.startsWith("2.") ||
    u.startsWith("1 ") ||
    u.startsWith("2 ");

  // 2. El asistente indica explícitamente que adjunta o envía la imagen del QR oficial
  const assistantSendingQr =
    a.includes("código qr oficial") ||
    a.includes("codigo qr oficial") ||
    a.includes("te envío el código qr") ||
    a.includes("te envio el codigo qr") ||
    a.includes("te adjunto el qr") ||
    a.includes("aquí tienes el código qr") ||
    a.includes("aqui tienes el codigo qr") ||
    a.includes("aquí te dejamos el qr") ||
    a.includes("escanea el código qr") ||
    a.includes("escanea este qr") ||
    a.includes("envío la imagen del qr");

  // El QR se envía si el asistente confirmó el envío del QR,
  // O si el usuario eligió Nequi/Bre-B y el asistente está gestionando el pago de Nequi/Bre-B
  if (assistantSendingQr) return true;
  if (
    userExplicitlySelectedQr &&
    (a.includes("nequi") || a.includes("bre-b") || a.includes("breb") || a.includes("llave"))
  ) {
    return true;
  }

  return false;
}

// Extrae productos y cantidades mencionadas
function extractProductsFromText(
  text: string,
  catalog: Product[]
): { items: Array<{ sku: string; quantity: number; unitPrice: number; name: string }>; total: number } {
  const lower = text.toLowerCase();
  const items: Array<{ sku: string; quantity: number; unitPrice: number; name: string }> = [];
  let total = 0;

  for (const prod of catalog) {
    let matched = false;
    let qty = 1;

    // Coincidencia exacta de SKU
    const skuRegex = new RegExp(`\\b${prod.sku}\\b`, "i");
    if (skuRegex.test(lower)) {
      matched = true;
      const qm = text.match(new RegExp(`(?:${prod.sku})[^\\d]{0,6}(\\d+)`, "i"));
      if (qm) qty = Math.max(1, parseInt(qm[1], 10));
    }

    // Coincidencias por nombre / tipo
    if (!matched) {
      if (prod.sku === "C8S" && (lower.includes("caja x8 surtida") || lower.includes("caja 8 surtida") || lower.includes("caja de surtidos") || lower.includes("caja surtida de 8") || lower.includes("caja surtida") || lower.includes("surtidos por 8") || lower.includes("surtidos por 10") || lower.includes("caja de 8"))) {
        matched = true;
      } else if (prod.sku === "C4S" && (lower.includes("caja x4 surtida") || lower.includes("caja 4 surtida") || lower.includes("caja de 4 surtida") || lower.includes("caja de 4"))) {
        matched = true;
      } else if (prod.sku === "C8T" && (lower.includes("caja x8 tradicional") || lower.includes("caja 8 tradicional") || lower.includes("caja tradicional de 8"))) {
        matched = true;
      } else if (prod.sku === "C4T" && (lower.includes("caja x4 tradicional") || lower.includes("caja 4 tradicional") || lower.includes("caja tradicional de 4"))) {
        matched = true;
      } else if (prod.sku === "BM" && (lower.includes("buñuelo mora") || lower.includes("buñuelos de mora") || lower.includes("de mora") || lower.includes("relleno de mora"))) {
        matched = true;
      } else if (prod.sku === "BA" && (lower.includes("buñuelo arequipe") || lower.includes("buñuelos de arequipe") || lower.includes("de arequipe") || lower.includes("relleno de arequipe"))) {
        matched = true;
      } else if (prod.sku === "BQ" && (lower.includes("buñuelo queso") || lower.includes("buñuelos de queso") || lower.includes("de queso") || lower.includes("relleno de queso"))) {
        matched = true;
      } else if (prod.sku === "BC" && (lower.includes("buñuelo costeño") || lower.includes("buñuelos costeños") || lower.includes("costeño") || lower.includes("tradicional individual"))) {
        matched = true;
      } else if (prod.sku === "BEB_CAFE" && (lower.includes("café") || lower.includes("cafe") || lower.includes("tinto"))) {
        matched = true;
      } else if (prod.sku === "BEB_CHOC" && (lower.includes("chocolate") || lower.includes("chocolatito"))) {
        matched = true;
      } else if (prod.sku === "BEB_GAS" && (lower.includes("gaseosa") || lower.includes("coca cola") || lower.includes("coca-cola") || lower.includes("colombiana") || lower.includes("manzana"))) {
        matched = true;
      } else if (prod.sku === "BEB_JUGO" && (lower.includes("jugo") || lower.includes("jugo natural") || lower.includes("jugo de mora"))) {
        matched = true;
      } else if (prod.sku === "BEB_AGUA" && (lower.includes("agua") || lower.includes("botella de agua"))) {
        matched = true;
      }
    }

    if (matched) {
      // Buscar si el cliente especificó cantidad ej: "2 cajas", "3 buñuelos"
      const qtyMatch = lower.match(new RegExp(`(\\d+)\\s*(?:cajas?|buñuelos?|unidades?|x)?\\s*(?:de\\s*)?${prod.name.slice(0, 7).toLowerCase()}`, "i"));
      if (qtyMatch) {
        qty = Math.max(1, parseInt(qtyMatch[1], 10));
      }
      items.push({
        sku: prod.sku,
        name: prod.name,
        quantity: qty,
        unitPrice: prod.price,
      });
      total += prod.price * qty;
    }
  }

  return { items, total };
}

// Sanitizar historial de mensajes para Gemini (alternando estrictamente user/model sin duplicados)
function buildGeminiContents(
  previousMessages: Message[],
  currentText: string
): Array<{ role: "user" | "model"; parts: [{ text: string }] }> {
  const msgs = [...previousMessages];
  const lastMsg = msgs[msgs.length - 1];

  // Si el mensaje actual no fue agregado al historial todavía, lo agregamos
  if (!lastMsg || lastMsg.role !== "user" || lastMsg.content.trim() !== currentText.trim()) {
    msgs.push({
      id: "current",
      conversationId: "",
      role: "user",
      content: currentText,
      createdAt: Date.now(),
    });
  }

  const turns: Array<{ role: "user" | "model"; parts: [{ text: string }] }> = [];
  // Mantener suficiente memoria de contexto (35 mensajes) para no perder productos pedidos en turnos previos
  for (const m of msgs.slice(-35)) {
    let text = (m.content || "").trim();
    if (!text) continue;

    let role: "user" | "model";
    if (m.role === "assistant") {
      role = "model";
    } else if (m.role === "system") {
      // Si es una nota de voz transcrita, convertirla en turno del cliente
      if (text.startsWith("🎤 [Nota de voz transcrita]:")) {
        role = "user";
        text = text.replace(/^🎤\s*\[Nota de voz transcrita\]:\s*"?/i, "").replace(/"?\s*$/i, "").trim();
        if (!text) continue;
      } else {
        // Ignorar logs internos del sistema (pausas, llamadas rechazadas, alertas)
        continue;
      }
    } else {
      role = "user";
      // Si es el placeholder antiguo de audio, no aporta nada salvo que tenga transcripción
      if (text === "🎤 [Nota de voz / Audio]") continue;
      if (text.startsWith("🎤 [Nota de voz]:")) {
        text = text.replace(/^🎤\s*\[Nota de voz\]:\s*"?/i, "").replace(/"?\s*$/i, "").trim();
        if (!text) continue;
      }
    }

    if (turns.length === 0) {
      // El primer mensaje en Gemini DEBE ser 'user'
      if (role === "user") {
        turns.push({ role: "user", parts: [{ text }] });
      }
    } else {
      const prevTurn = turns[turns.length - 1];
      if (prevTurn.role === role) {
        // Si hay 2 turnos consecutivos del mismo rol, los fusionamos
        prevTurn.parts[0].text += `\n${text}`;
      } else {
        turns.push({ role, parts: [{ text }] });
      }
    }
  }

  // Si quedó vacío o el último no es 'user', forzamos el turno de usuario con currentText
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    turns.push({ role: "user", parts: [{ text: currentText }] });
  }

  return turns;
}

// Sanitizar historial para OpenAI
function buildOpenAIMessages(
  systemPrompt: string,
  previousMessages: Message[],
  currentText: string
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const msgs = [...previousMessages];
  const lastMsg = msgs[msgs.length - 1];

  if (!lastMsg || lastMsg.role !== "user" || lastMsg.content.trim() !== currentText.trim()) {
    msgs.push({
      id: "current",
      conversationId: "",
      role: "user",
      content: currentText,
      createdAt: Date.now(),
    });
  }

  const out: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  for (const m of msgs.slice(-35)) {
    let content = (m.content || "").trim();
    if (!content) continue;

    let role: "user" | "assistant";
    if (m.role === "assistant") {
      role = "assistant";
    } else if (m.role === "system") {
      if (content.startsWith("🎤 [Nota de voz transcrita]:")) {
        role = "user";
        content = content.replace(/^🎤\s*\[Nota de voz transcrita\]:\s*"?/i, "").replace(/"?\s*$/i, "").trim();
        if (!content) continue;
      } else {
        continue;
      }
    } else {
      role = "user";
      if (content === "🎤 [Nota de voz / Audio]") continue;
      if (content.startsWith("🎤 [Nota de voz]:")) {
        content = content.replace(/^🎤\s*\[Nota de voz\]:\s*"?/i, "").replace(/"?\s*$/i, "").trim();
        if (!content) continue;
      }
    }
    out.push({ role, content });
  }

  return out;
}

// Helper: Extraer pedido estructurado si el texto o respuesta contiene confirmación
async function tryExtractAndRegisterOrder(
  conversationKey: string,
  userText: string,
  assistantReply: string,
  products: Product[],
  clientName?: string
) {
  const assistantLower = assistantReply.toLowerCase();
  const isPreConfirmationSummary =
    assistantLower.includes("resumen de tu pedido") ||
    assistantLower.includes("1️⃣ ✅ confirmar pedido") ||
    assistantLower.includes("responde con el número para continuar") ||
    (assistantLower.includes("1️⃣") && (assistantLower.includes("confirmar") || assistantLower.includes("modificar")));

  const hasConfirmationKeyword =
    !isPreConfirmationSummary &&
    (assistantLower.includes("pedido confirmado y registrado") ||
      assistantLower.includes("¡pedido confirmado en buñuelandia!") ||
      assistantLower.includes("¡pedido confirmado") ||
      assistantLower.includes("pedido registrado") ||
      assistantLower.includes("hemos registrado tu pedido") ||
      assistantLower.includes("pedido creado") ||
      assistantLower.includes("van en camino calienticos"));

  if (!hasConfirmationKeyword) return null;

  const combined = (userText + " " + assistantReply).toLowerCase();
  const { items: extractedItems, total: extractedTotal } = extractProductsFromText(combined, products);

  const orderItems: Array<{ sku: string; quantity: number; unitPrice: number }> = [];
  let detectedTotal = extractedTotal;

  if (extractedItems.length > 0) {
    for (const it of extractedItems) {
      orderItems.push({
        sku: it.sku,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      });
    }
  } else if (products.length > 0) {
    const defaultProduct = products.find((p) => p.sku === "C8S") || products[0];
    orderItems.push({
      sku: defaultProduct.sku,
      quantity: 1,
      unitPrice: defaultProduct.price,
    });
    detectedTotal = defaultProduct.price;
  }

  // 1. Extraer dirección de entrega: primero de la confirmación estructurada del asistente
  let address: string | null = null;
  const assistantAddrMatch = assistantReply.match(
    /(?:📍\s*)?\*?(?:Direcci[oó]n|Lugar de entrega|Enviar a|Despachar a|Entrega en|Destino)(?: de entrega| de env[ií]o| del pedido)?:\*?\s*([^\n\r*]+)/i
  );
  if (assistantAddrMatch && assistantAddrMatch[1]) {
    const raw = assistantAddrMatch[1].replace(/^[\[\(]|[\]\)]$/g, "").trim();
    const cand = cleanAddressCandidate(raw);
    if (cand && cand.length >= 4) {
      address = cand;
    }
  }
  // Si no está en el asistente, extraer del mensaje del usuario
  if (!address) {
    address = extractAddress(userText);
  }
  // Si aún no se detecta, buscar en el historial de mensajes de la conversación (fallback multi-turno)
  if (!address) {
    try {
      const history = await getMessages(conversationKey);
      const userMsgs = history.filter((m) => m.role === "user").reverse();
      for (const m of userMsgs) {
        const found = extractAddress(m.content);
        if (found) {
          address = found;
          break;
        }
      }
    } catch {
      // fallback
    }
  }
  if (!address) {
    address = "Dirección indicada en chat";
  }

  // 2. Extraer nombre del cliente
  let customerName = clientName;
  const assistantNameMatch = assistantReply.match(
    /(?:👤\s*)?\*?(?:Cliente|Nombre):\*?\s*([^\n\r*]+)/i
  );
  if (assistantNameMatch && assistantNameMatch[1]) {
    const cand = assistantNameMatch[1].replace(/^[\[\(]|[\]\)]$/g, "").trim();
    if (
      cand.length >= 2 &&
      !cand.toLowerCase().includes("cliente whatsapp") &&
      !cand.toLowerCase().includes("nombre del cliente")
    ) {
      customerName = cand;
    }
  }
  if (!customerName || customerName.toLowerCase().startsWith("cliente whatsapp")) {
    const lines = userText.split(/[\r\n]+/);
    for (const l of lines) {
      const nm = l.match(/(?:mi nombre es|nombre(?:\s+completo)?:\s*|a nombre de\s+|soy\s+|me llamo\s+)([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{3,35})/i);
      if (nm && nm[1]) {
        const cand = nm[1].trim();
        if (!cand.toLowerCase().includes("nequi") && !cand.toLowerCase().includes("breb") && !cand.toLowerCase().includes("efectivo") && !cand.toLowerCase().includes("caja")) {
          customerName = cand;
          break;
        }
      }
    }
  }
  // Si aún no se detecta, buscar en el historial de mensajes de la conversación
  if (!customerName || customerName.toLowerCase().startsWith("cliente whatsapp")) {
    try {
      const history = await getMessages(conversationKey);
      const userMsgs = history.filter((m) => m.role === "user").reverse();
      for (const m of userMsgs) {
        const lines = m.content.split(/[\r\n]+/);
        for (const l of lines) {
          const nm = l.match(/(?:mi nombre es|nombre(?:\s+completo)?:\s*|a nombre de\s+|soy\s+|me llamo\s+)([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{3,35})/i);
          if (nm && nm[1]) {
            const cand = nm[1].trim();
            if (!cand.toLowerCase().includes("nequi") && !cand.toLowerCase().includes("breb") && !cand.toLowerCase().includes("efectivo") && !cand.toLowerCase().includes("caja")) {
              customerName = cand;
              break;
            }
          }
        }
        if (customerName && !customerName.toLowerCase().startsWith("cliente whatsapp")) break;
      }
    } catch {
      // fallback
    }
  }
  if (!customerName) {
    customerName = `Cliente WhatsApp ${conversationKey.replace(/[^0-9]/g, "").slice(-4) || ""}`;
  }

  // 3. Extraer medio de pago
  let paymentMethod: string | null = null;
  const assistantPayMatch = assistantReply.match(
    /(?:💳\s*)?\*?Medio de pago:\*?\s*([^\n\r*]+)/i
  );
  if (assistantPayMatch && assistantPayMatch[1]) {
    const cand = assistantPayMatch[1].replace(/^[\[\(]|[\]\)]$/g, "").trim();
    paymentMethod = extractPaymentMethod(cand);
  }
  if (!paymentMethod) {
    paymentMethod = extractPaymentMethod(userText) || extractPaymentMethod(combined) || "Efectivo contra entrega";
  }

  // 4. Extraer total de la confirmación si está explícito
  const totalAssistantMatch = assistantReply.match(
    /(?:💰|\*?Total a pagar:\*?)[^\d]*?([\d.,]+)/i
  );
  if (totalAssistantMatch && totalAssistantMatch[1]) {
    const parsedTotal = parseInt(totalAssistantMatch[1].replace(/[.,]/g, ""), 10);
    if (!isNaN(parsedTotal) && parsedTotal > 0) {
      detectedTotal = parsedTotal;
    }
  } else if (detectedTotal === 0) {
    const totalMatch = combined.match(/total[^\d]*?(\d[\d.,]*)/i);
    if (totalMatch) {
      detectedTotal = parseInt(totalMatch[1].replace(/[.,]/g, ""), 10);
    }
  }

  // 5. Extraer resumen de productos
  let summary = orderItems.map((it) => `${it.sku} x${it.quantity}`).join(", ");
  const detMatch = assistantReply.match(/(?:\*?Detalle del Pedido:\*?|🛒[^\n]*)[\r\n]+([\s\S]*?)(?=(?:💰|\*?Total a pagar|\*?Direcci[oó]n|💵|$))/i);
  if (detMatch && detMatch[1]) {
    const cleanDet = detMatch[1].trim();
    if (cleanDet.length > 0 && !cleanDet.startsWith("[")) {
      summary = cleanDet;
    }
  }

  // 6. Costo de domicilio: 100% GRATIS siempre ($0)
  const detectedFee = 0;

  // 7. Extraer notas especiales de entrega
  let detectedNotes: string | undefined = undefined;
  const notesMatch = assistantReply.match(/(?:🏢\s*)?\*?Notas(?: especiales)?(?: de entrega)?:\*?\s*([^\n\r*]+)/i);
  if (notesMatch && notesMatch[1]) {
    const cleanNotes = notesMatch[1].replace(/^[\[\(]|[\]\)]$/g, "").trim();
    if (cleanNotes.length > 2 && !cleanNotes.toLowerCase().includes("ninguna")) {
      detectedNotes = cleanNotes;
    }
  }

  // 8. Extraer información de cambio / billete
  let detectedChange: string | undefined = undefined;
  const changeMatch = assistantReply.match(/(?:(?:billete|paga con|cambio|vueltas)[^:\n*]*[:\s]+)([^\n\r*]+)/i);
  if (changeMatch && changeMatch[1]) {
    detectedChange = changeMatch[1].trim();
  }

  const order = await createOrder(conversationKey, orderItems, detectedTotal, {
    customerName,
    deliveryAddress: address,
    paymentMethod,
    itemsSummary: summary,
    deliveryFee: detectedFee,
    changeAmount: detectedChange,
    deliveryNotes: detectedNotes,
  });

  if (customerName && !customerName.toLowerCase().startsWith("cliente whatsapp")) {
    await setConversationCustomerName(conversationKey, customerName).catch(() => {});
  }

  // Generar factura oficial automáticamente en Buñuelandia Contabilidad (Opción 1)
  try {
    const invRes = await createInvoiceInContabilidad({
      orderId: order.id,
      customerName,
      phone: conversationKey.replace(/^whatsapp:/i, ""),
      deliveryAddress: address,
      deliveryNotes: detectedNotes,
      paymentMethod,
      changeAmount: detectedChange,
      items: orderItems.map((it) => {
        const prod = products.find((p) => p.sku === it.sku);
        return {
          sku: it.sku,
          name: prod?.name || it.sku,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        };
      }),
      deliveryFee: detectedFee,
      total: detectedTotal,
    });

    if (invRes.ok && invRes.invoiceNumber) {
      await updateOrderInvoice(
        order.id,
        invRes.invoiceNumber,
        invRes.invoiceId,
        invRes.invoiceUrl,
        invRes.invoicePdfUrl
      );
      order.invoiceNumber = invRes.invoiceNumber;
      order.invoiceId = invRes.invoiceId;
      order.invoiceUrl = invRes.invoiceUrl;
      order.invoicePdfUrl = invRes.invoicePdfUrl;
    }
  } catch (invErr) {
    console.error("[sales-agent] Error generando factura automática:", invErr);
  }

  // Notificar automáticamente al domiciliario asignado por WhatsApp
  notifyDeliveryDriver(order).catch((dErr) => {
    console.warn("[sales-agent] Error notificando al domiciliario:", dErr);
  });

  return order;
}

export async function handleSalesMessage(
  conversationKey: string,
  userText: string,
  pushName?: string
): Promise<SalesMessageResult> {
  const text = (userText || "").trim();
  const lower = text.toLowerCase();

  const settings = await getOrgSettings();
  const products = await getProducts(true);

    // --- BUSINESS HOURS CHECK ---
    if (settings.businessHoursEnabled === "true") {
      const start = settings.businessHoursStart || "08:00";
      const end = settings.businessHoursEnd || "20:00";
      
      const now = new Date();
      const coTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
      const hours = coTime.getHours();
      const minutes = coTime.getMinutes();
      const currentTimeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

      if (currentTimeStr < start || currentTimeStr > end) {
        const reply = settings.outOfHoursMessage || "¡Hola! En este momento nos encontramos cerrados. Te atenderemos con gusto en nuestro horario de atención.";
        await appendMessage(conversationKey, "assistant", reply);
        return { reply, mode: "keyword" };
      }
    }
    // ----------------------------


  // 1. Escalamiento a humano inmediato
  if (
    lower.includes("escalar humano") ||
    lower.includes("humano") ||
    lower.includes("asesor") ||
    lower.includes("persona") ||
    lower.includes("hablar con alguien")
  ) {
    await setConversationStatus(conversationKey, "human");
    const reply =
      "Entendido, he transferido esta conversación a uno de nuestros asesores humanos. En breve te responderán por este mismo chat. ¡Gracias por tu paciencia!";
    await appendMessage(conversationKey, "assistant", reply);
    return { reply, mode: "human_escalated" };
  }

  const upsellDrinks = settings.upsellDrinksEnabled !== "false";

  // --- INTENCIÓN DE NUEVO PEDIDO / REINICIAR PEDIDO ---
  const isNewOrderIntent =
    lower.includes("nuevo pedido") ||
    lower.includes("otro pedido") ||
    lower.includes("pedir de nuevo") ||
    lower.includes("otra orden") ||
    lower.includes("nueva orden") ||
    lower.includes("quiero pedir de nuevo") ||
    lower.includes("hacer otro pedido") ||
    lower.includes("quiero hacer un nuevo pedido") ||
    lower.includes("hacer un nuevo pedido");

  if (isNewOrderIntent) {
    const drinksMention = upsellDrinks
      ? `\n\n🥤 *Bebidas para acompañar:* Café campesino ($3.500), Chocolate caliente ($4.000), Gaseosa helada ($4.500), Jugo de mora ($6.000) o Agua ($3.000).`
      : "";
    const reply = `¡Hola, hola! 🥳 ¡Con muchísimo gusto te tomamos un nuevo pedido en *BUÑUELANDIA*! 🥟🔥\n\n¿Qué se te antoja hoy?\n\n📦 *Nuestras Cajas:* \n• *Caja x4 Tradicional:* $16.000\n• *Caja x8 Tradicional:* $32.000\n• *Caja x4 Surtida:* $18.000 _(con salsas de Mora, Arequipe, Queso o Bocadillo)_\n• *Caja x8 Surtida:* $36.000 _(con salsas de Mora, Arequipe, Queso o Bocadillo)_${drinksMention}\n\n¿Qué caja o productos te gustaría ordenar?`;
    await appendMessage(conversationKey, "assistant", reply);
    return { reply, mode: "keyword" };
  }

  // --- VERIFICACIÓN DE PEDIDO PREVIO Y CORTESÍA / AGRADECIMIENTO ---
  const allOrders = await getOrders().catch(() => []);
  const customerDigits = conversationKey.replace(/\D/g, "").slice(-10);
  const userOrders = allOrders.filter((o) => {
    if (o.conversationId === conversationKey) return true;
    if (customerDigits && o.conversationId.replace(/\D/g, "").includes(customerDigits)) return true;
    return false;
  });
  const latestOrder = userOrders[0]; // La orden más reciente del cliente

  const isGratitudeOrClosing =
    /^(?:muchas\s+)?gracias(?:[!\s.]*)$/i.test(text) ||
    /^(?:mil\s+)?gracias(?:[!\s.]*)$/i.test(text) ||
    /^(?:muchas\s+)?gracias\s+(?:a\s+ustedes|por\s+todo|amigo|amiga|vecino|buñuelandia|muy\s+amable)(?:[!\s.]*)$/i.test(text) ||
    /^(?:muy\s+amable|perfecto|excelente|s[uú]per|listo|ok|vale|buen\s+provecho|feliz\s+d[ií]a|hasta\s+luego|chao)(?:[!\s.]*)$/i.test(text);

  if (latestOrder && isGratitudeOrClosing) {
    if (latestOrder.status === "delivered") {
      const reply =
        "¡Con muchísimo gusto! 🎉 Qué alegría atenderte. Esperamos que disfrutes un montón tus buñuelos calienticos y crujientes. ¡Aquí siempre a la orden en BUÑUELANDIA! 🥟❤️ ¡Que tengas un excelente día!";
      await appendMessage(conversationKey, "assistant", reply);
      return { reply, mode: "keyword" };
    }
    if (latestOrder.status === "delivering") {
      const reply =
        "¡Con mucho gusto! 🛵 Tu domiciliario va en camino con tus buñuelos calienticos. ¡Atento a la puerta o portería! Buen provecho. 🥟✨";
      await appendMessage(conversationKey, "assistant", reply);
      return { reply, mode: "keyword" };
    }
    if (latestOrder.status === "preparing") {
      const reply =
        "¡Con todo el gusto! 👨‍🍳 En cocina estamos dorando tus buñuelos para que te lleguen frescos, crujientes y calienticos. ¡Te avisamos apenas salgan! 🥟🔥";
      await appendMessage(conversationKey, "assistant", reply);
      return { reply, mode: "keyword" };
    }
  }

  const etaTime = settings.estimatedDeliveryTime || "30 a 45 minutos";

  // --- SI EL CLIENTE YA TIENE UN PEDIDO ACTIVO (En preparación, En camino o Pendiente) ---
  const hasActiveOrder =
    latestOrder &&
    (latestOrder.status === "pending" ||
     latestOrder.status === "confirmed" ||
     latestOrder.status === "preparing" ||
     latestOrder.status === "delivering");

  const isAskingStatus =
    lower.includes("estado") ||
    lower.includes("dónde va") ||
    lower.includes("donde va") ||
    lower.includes("cuándo llega") ||
    lower.includes("cuando llega") ||
    lower.includes("cuanto demora") ||
    lower.includes("cuánto demora") ||
    lower.includes("demora") ||
    lower.includes("mi pedido");

  // Si ya tiene un pedido activo y NO está pidiendo productos nuevos explícitamente:
  const isOrderingNewItems =
    lower.includes("caja") ||
    lower.includes("buñuelo") ||
    lower.includes("gaseosa") ||
    lower.includes("jugo") ||
    lower.includes("café") ||
    lower.includes("cafe");

  const isModifyingOrPayingActiveOrder =
    lower.includes("modificar") ||
    lower.includes("cambiar") ||
    lower.includes("corregir") ||
    lower.includes("torre") ||
    lower.includes("apto") ||
    lower.includes("apartamento") ||
    lower.includes("portería") ||
    lower.includes("porteria") ||
    lower.includes("nequi") ||
    lower.includes("bre-b") ||
    lower.includes("breb") ||
    lower.includes("qr");

  if (hasActiveOrder && !isOrderingNewItems && !isModifyingOrPayingActiveOrder) {
    const statusText =
      latestOrder.status === "delivering"
        ? "en camino con el domiciliario 🛵"
        : latestOrder.status === "preparing"
        ? "en preparación en cocina 👨‍🍳🔥"
        : latestOrder.status === "confirmed"
        ? "confirmado y en fila de preparación ✅"
        : "registrado en nuestro sistema ⏳";

    const reply = `¡Hola! 👋 Te recordamos que tu pedido *#${latestOrder.id.slice(0, 8)}* ya se encuentra *${statusText}*.\n\n🛵 Tiempo estimado de entrega: ${etaTime}.\n\nSi necesitas algo adicional, escribe *asesor*. Si deseas hacer otro pedido diferente, escribe *nuevo pedido*.`;
    await appendMessage(conversationKey, "assistant", reply);
    return { reply, mode: "keyword" };
  }

  // Filtrar el historial si ya existe un pedido previo del cliente,
  // para que NINGÚN producto o dirección de pedidos anteriores se mezcle con el nuevo chat
  const rawPrevious = await getMessages(conversationKey);
  let previous = rawPrevious;
  if (latestOrder) {
    const orderTime = latestOrder.createdAt || 0;
    const sinceOrder = rawPrevious.filter((m) => m.createdAt > orderTime);
    previous = sinceOrder;
  }
  const catalogText = products
    .map((p) => `- ${p.name}: ${formatCop(p.price)} (${p.description || "Deliciosos y frescos"})`)
    .join("\n");

  const nequiNumber = settings.nequiNumber || "3228964947";
  const brebKey = settings.brebKey || "3228964947";
  const hasPushName = pushName && !pushName.toLowerCase().startsWith("cliente whatsapp");
  const nameContext = hasPushName
    ? `👤 DATOS DEL CLIENTE: El cliente figura como "${pushName}" en WhatsApp. Confirma amablemente si el pedido queda registrado a nombre de ${pushName} o a nombre de quién más.`
    : `👤 DATOS DEL CLIENTE: Aún no tenemos el nombre de la persona. Es OBLIGATORIO pedir su nombre en el Paso 4.`;

  const systemPrompt = `Eres el asistente virtual y vendedor estrella por WhatsApp de "${settings.name}".

  ${nameContext}

  ⚡ REGLA DE BREVEDAD ESTRICTA (¡OBLIGATORIA!):
  - Envía SIEMPRE respuestas cortas, directas y fáciles de leer en dispositivos móviles (máximo de 3 a 4 líneas por mensaje).
  - Elimina bloques de texto extensos, rodeos o explicaciones innecesarias.

  🎭 PERSONALIDAD Y TONO:
  ¡Eres MUY carismático, alegre, persuasivo y antojador! Tu objetivo principal es: ${settings.botObjective || "vender y hacer agua la boca del cliente."} 
  - Usa MUCHOS EMOJIS en todos tus mensajes (👋✨🤤📦🧀🍯🇨🇴).
  - Usa expresiones amigables y típicas (ej: "¡Uff, excelente elección!", "¡Qué delicia!", "para chuparse los dedos").
  - Habla de lo "calientitos, doraditos y súper crujientes" que están los buñuelos.
  - Aunque tus reglas son estrictas, tu forma de hablar debe ser súper amena, divertida y NADA robótica.

  Reglas del negocio: ${settings.rules}

  🛵 DOMICILIO 100% GRATIS:
  - El costo de envío es SIEMPRE $0 (¡GRATIS!) para todos los pedidos, sin umbrales ni cobros adicionales.

  🔥 CATÁLOGO ESTRICTO (Precios en COP):
  ${catalogText}
  ¡REGLA DE ORO!: NO inventes productos, tamaños ni sabores que no estén en este catálogo. Solo vendemos cajas de 4 o de 8, y las bebidas del menú.

  📌 FLUJO DE VENTA PASO A PASO (Sigue este orden estrictamente):
  1. SALUDO Y MENÚ: Inicia SIEMPRE con mucho entusiasmo (ej. "¡Hola, hola! 🥳 ¡Bienvenido a *BUÑUELANDIA*! 🥟🔥"). Antoja al cliente y muéstrale nuestras Cajas Tradicionales y Surtidas.
  2. ELECCIÓN Y SALSAS (OBLIGATORIO): 
     - Si el cliente menciona que quiere buñuelos o una caja pero no especificó cuál:
       Pregúntale de inmediato: «¡Con gusto! 🤤 ¿Qué caja te gustaría: Tradicional o Surtida, de 4 o de 8 buñuelos?» antes de pasar a la dirección.
     - Si el cliente elige una caja "Tradicional", es sin salsa, pasa al paso 3.
     - Si el cliente elige una caja "Surtida" (C4S o C8S), ES OBLIGATORIO PREGUNTARLE LAS SALSAS antes de pedir la dirección:
       «¿Qué salsas prefieres para tu caja surtida? Tenemos Mora, Arequipe, Bocadillo y Suero Costeño 🤤 (puedes combinarlas como prefieras).»
  ${upsellDrinks ? `3. VENTA CRUZADA Y CATÁLOGO DE BEBIDAS:
     - Justo después de que el cliente elija su caja (y salsas si aplica), antes de pedir la dirección, pregúntale amigablemente si desea agregar bebidas para acompañar:
       «¿Te gustaría acompañar tus buñuelos con alguna bebida bien fría o caliente? ☕🥤 Tenemos café campesino ($3.500), chocolate caliente ($4.000), gaseosa helada ($4.500), jugo de mora ($6.000) o agua ($3.000).»
     - Si el cliente pregunta en cualquier momento por bebidas, preséntale amigablemente las opciones.
     - Si el cliente acepta alguna bebida, agrégala al pedido; si dice que no, avanza inmediatamente al paso 4 sin insistir.` : `3. BEBIDAS DESACTIVADAS (NO OFRECER BEBIDAS):
     - El interruptor de venta de bebidas está APAGADO. NO ofrezcas bebidas activamente. Pasa DIRECTAMENTE al paso 4 (Recolección de datos de entrega).`}
  4. RECOLECCIÓN DE DATOS DE ENTREGA Y NOMBRE DEL CLIENTE:
     - ✍️ PEDIR NOMBRE Y DIRECCIÓN:
       Pide SIEMPRE el nombre de la persona que recibe y la dirección de entrega para registrar su pedido:
       «¿A nombre de quién dejamos registrado el pedido y cuál es tu dirección de entrega? ✍️📍»
     - Si el cliente ya dio su dirección pero aún no ha dicho su nombre:
       Pregúntale amablemente: «¡Listo! ¿A nombre de quién registramos el pedido? 👤»
     - Si el cliente ya dijo su nombre pero falta la dirección:
       Pregúntale: «¡Perfecto! ¿Cuál es tu dirección de entrega en Neiva? 📍»
     - RECONOCIMIENTO AMPLIO DE DIRECCIONES COLOMBIANAS:
       Acepta y reconoce de inmediato CUALQUIER variedad de dirección:
       * Conjuntos residenciales, edificios, condominios, urbanizaciones, ciudadelas (ej: "Conjunto Puertas del Sol Casa 4", "Condominio Campestre El Peñón", "Edificio Mirador Apto 502", "Urbanización Los Sauces", "Reserva de la Sierra").
       * Veredas, fincas, haciendas, corregimientos, sectores rurales o vías (ej: "Vereda La Balsa sector Los Molinos", "Vereda El Rosal finca La Florida", "Finca El Recreo vereda Chimbi", "Km 5 Vía Suba").
       * Nomenclatura urbana estándar (Calle, Carrera, Diagonal, Transversal, Avenida, etc.).
       * Manzanas y lotes (ej: "Mz 4 Casa 12 Barrio El Progreso").
       * Indicaciones o referencias libres (ej: "frente a la escuela", "casa verde de rejas negras", "sobre la vía principal").
     - 🚨 REGLA ESTRICTA (CERO BUCLES DE DIRECCIÓN):
       Si tú (el bot) ya pediste la dirección en el mensaje anterior y el cliente responde indicando su ubicación (incluso si no tiene nomenclatura tradicional, o dice un conjunto, vereda o referencia):
       ¡ACÉPTALO DE INMEDIATO como dirección de entrega! NUNCA vuelvas a enviar el mensaje pidiendo la dirección nuevamente. Agradece la indicación y si ya tienes su nombre avanza DIRECTAMENTE al paso 5 (medio de pago).
  5. MEDIO DE PAGO:
     - Informa que el domicilio es ¡100% GRATIS!
     - Opciones de pago:
       1️⃣ *Nequi*
       2️⃣ *Bre-B*
       3️⃣ *Efectivo contra entrega*
     - SI ELIGE NEQUI O BRE-B (o pide QR/transferencia):
       Infórmale alegremente que le envías el código QR oficial de pago y OBLIGATORIAMENTE incluye este bloque en texto limpio con acento grave para que el cliente pueda copiar el número con un solo toque:
       📱 *Nequi:* \`${nequiNumber}\`
       🔑 *Llave Bre-B:* \`${brebKey}\`
       💰 *Total exacto a pagar:* [Total en COP]
       *(Toca y mantén presionado el número para copiarlo rápidamente a tu app bancaria)*
     - SI ELIGE EFECTIVO:
       Pregúntale: «¿Con qué billete vas a pagar? (ej: billete de $50.000 o monto exacto) para que el domiciliario te lleve el cambio listo 💵»
  6. RESUMEN PREVIO (PRE-CONFIRMACIÓN):
     🚨 REGLA ESTRICTA DE CONTINUIDAD (¡CERO AMNESIA DE PRODUCTOS!):
     - Revisa SIEMPRE todo el historial de la conversación. Si el cliente ya eligió sus productos o caja de buñuelos en cualquier mensaje previo (texto o nota de voz), JAMÁS vuelvas a preguntarle qué caja desea ni digas "parece que aún no elegiste tus buñuelos".
     - Una vez tengas los productos (con salsas si aplica), el nombre del cliente, la dirección Y el medio de pago (y si es efectivo, la denominación del billete/cambio), envía DIRECTAMENTE el resumen compacto con opciones en texto plano:

     📋 *Resumen de tu Pedido:*
     • [Productos x cantidad y salsas/bebidas]
     📦 *Subtotal productos:* [Subtotal en COP]
     🛵 *Domicilio:* ¡GRATIS!
     💰 *Total a pagar:* [Total en COP]
     👤 *Cliente:* [Nombre del cliente]
     📍 *Dirección de entrega:* [Dirección exacta del cliente]
     💳 *Medio de pago:* [Medio de pago]

     ¿Todo está correcto? Elige una opción:
     1️⃣ ✅ Confirmar pedido
     2️⃣ ✏️ Modificar algún dato

  7. CONFIRMACIÓN FINAL Y FACTURACIÓN:
     SÓLO cuando el cliente responda con el número "1" (o palabras como "confirmar", "sí", "confirmo", "dale"), enviarás la confirmación final usando este formato:

     ✅ *¡Pedido Confirmado y Registrado en BUÑUELANDIA!* 🛵🥟

     🛒 *Detalle del Pedido:*
     [Lista de productos x cantidad, salsas y bebidas si aplica]

     📦 *Subtotal productos:* [Subtotal exacto en COP]
     🛵 *Costo de domicilio:* ¡GRATIS!
     💰 *Total a pagar:* [Total exacto en COP]
     📍 *Dirección de entrega:* [Dirección exacta del cliente]
     🏢 *Notas de entrega:* [Indicaciones de torre/apto/portería o "Ninguna"]
     💳 *Medio de pago:* [Medio ingresado, y si es efectivo con cuánto paga y cambio]
     👤 *Cliente:* [Nombre del cliente o "Cliente"]
     ⏱️ *Tiempo estimado de entrega:* ${etaTime}

     🔥 ¡Tus buñuelos van en camino calienticos y crujientes! ¡Gracias por tu compra en BUÑUELANDIA! 🥟

     - Si el cliente responde "2" o dice que quiere modificar algún dato, pregúntale amablemente qué desea cambiar (productos, dirección o medio de pago) y NO registres el pedido.

  🔄 CLIENTES RECURRENTES Y NUEVOS PEDIDOS:
  - Si el cliente ya completó un pedido anterior y vuelve a escribir para pedir buñuelos (o dice "hola", "otro pedido", "quiero pedir"), trátalo como un NUEVO pedido independiente.
  - El carrito nuevo arranca desde CERO: NUNCA mezcles ni vuelvas a cobrar productos del pedido anterior.
  - Si ya conoces su nombre y su dirección de entrega de pedidos pasados, salúdalo amigablemente por su nombre y pregúntale si enviamos el nuevo pedido a la misma dirección para ahorrarle tiempo.

  ⛔ RESTRICCIONES IMPORTANTES:
  - YA NO SE VENDE POR UNIDAD. SOLO SE VENDEN CAJAS DE 4 O DE 8. Si alguien pide unidades sueltas, explícale amablemente que solo manejamos cajas de 4 o de 8.
  - NUNCA mezcles productos de pedidos pasados con un pedido nuevo.
  - NUNCA inventes precios ni sumes mal.
  - NO confirmes ni registres el pedido hasta que el cliente responda "1" confirmando el resumen previo.
  - 🚨 ¡PROHIBICIÓN ESTRICTA!: NUNCA escribas frases como "*(Imagina aquí el Código QR...)*", ni inventes cuentas bancarias. El sistema de WhatsApp enviará automáticamente la imagen real del código QR oficial de BUÑUELANDIA.

  OPCIONES Y FORMATO DE RESPUESTA:
  - NO USES BOTONES NI ETIQUETAS [BOTONES:...]. Los botones están completamente desactivados.
  - Presenta SIEMPRE las opciones directamente dentro del texto de tu mensaje de forma clara, amigable y enumerada.

  ${settings.extraPrompt ? `📌 INSTRUCCIONES ADICIONALES (¡Síguelas al pie de la letra!):\n  ${settings.extraPrompt}` : ''}`;
  // 2. Intentar con Google Gemini (probando modelos disponibles: gemini-3.8-flash, gemini-2.0-flash, gemini-1.5-flash)
  if (process.env.GEMINI_API_KEY?.trim()) {
    const rawEnvModel = process.env.GEMINI_MODEL?.trim();
    const candidateGeminiModels = [
      rawEnvModel,
      "gemini-flash-lite-latest",
      "gemini-3.5-flash-lite",
      "gemini-flash-latest",
      "gemini-3.5-flash",
    ].filter(Boolean) as string[];

    const uniqueModels = Array.from(new Set(candidateGeminiModels));

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const contents = buildGeminiContents(previous, text);

      let lastError: unknown = null;
      for (const model of uniqueModels) {
        try {
          const callModel = async () => {
            try {
              return await ai.models.generateContent({
                model,
                contents,
                config: {
                  systemInstruction: systemPrompt,
                  temperature: 0.35,
                  maxOutputTokens: 2500,
                  thinkingConfig: {
                    thinkingBudget: 0,
                  },
                },
              });
            } catch {
              return await ai.models.generateContent({
                model,
                contents,
                config: {
                  systemInstruction: systemPrompt,
                  temperature: 0.35,
                  maxOutputTokens: 2500,
                },
              });
            }
          };

          let response: any;
          try {
            response = await callModel();
          } catch (callErr: any) {
            if (String(callErr?.message || "").includes("503") || callErr?.status === 503) {
              await new Promise((r) => setTimeout(r, 700));
              response = await callModel();
            } else {
              throw callErr;
            }
          }

          let reply = response.text?.trim() || settings.welcomeMessage;

          const maybeOrder = await tryExtractAndRegisterOrder(
            conversationKey,
            text,
            reply,
            products,
            pushName
          );

          if (maybeOrder?.invoiceNumber) {
            const publicUrl = maybeOrder.invoiceUrl || `https://contabilidad-app-fawn.vercel.app/api/invoices/public/${maybeOrder.invoiceId || ""}`;
            reply = `${reply}\n\n🧾 *Factura Oficial Registrada:* #${maybeOrder.invoiceNumber}\n📄 *Ver tu Factura digital:* ${publicUrl}`;
            logSystemEvent("success", "billing", `Factura Oficial #${maybeOrder.invoiceNumber} registrada en Contabilidad`, {
              orderId: maybeOrder.id,
              total: maybeOrder.total,
              publicUrl,
            });
          }

          await appendMessage(conversationKey, "assistant", reply);

          const shouldSendQr = Boolean(
            settings.transferQrImage && shouldSendTransferQr(text, reply)
          );

          return {
            reply,
            mode: maybeOrder ? "order_created" : "ai",
            mediaUrl: shouldSendQr ? settings.transferQrImage : undefined,
            invoiceUrl: maybeOrder?.invoiceUrl,
            invoicePdfUrl: maybeOrder?.invoicePdfUrl,
            invoiceNumber: maybeOrder?.invoiceNumber,
          };
        } catch (mErr: any) {
          lastError = mErr;
          console.warn(`[sales-agent] Gemini modelo ${model} falló, intentando siguiente...`, mErr?.message || mErr);
        }
      }
      console.warn("[sales-agent] Todos los modelos de Gemini fallaron; pasando a OpenAI como fallback...", lastError);
    } catch (geminiImportErr) {
      console.warn("[sales-agent] Error inicializando SDK de Gemini; intentando OpenAI...", geminiImportErr);
    }
  }

  // 3. Intentar con OpenAI (si Gemini no está o falló)
  if (process.env.OPENAI_API_KEY?.trim()) {
    try {
      const { OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      const messages = buildOpenAIMessages(systemPrompt, previous, text);

      const res = await openai.chat.completions.create({
        model,
        messages,
        temperature: 0.35,
        max_tokens: 1500,
      });

      let reply = res.choices[0]?.message?.content?.trim() || settings.welcomeMessage;

      const maybeOrder = await tryExtractAndRegisterOrder(
        conversationKey,
        text,
        reply,
        products,
        pushName
      );

      if (maybeOrder?.invoiceNumber) {
        const publicUrl = maybeOrder.invoiceUrl || `https://contabilidad-app-fawn.vercel.app/api/invoices/public/${maybeOrder.invoiceId || ""}`;
        reply = `${reply}\n\n🧾 *Factura Oficial Registrada:* #${maybeOrder.invoiceNumber}\n📄 *Ver tu Factura digital:* ${publicUrl}`;
      }

      await appendMessage(conversationKey, "assistant", reply);

      const shouldSendQr = Boolean(
        settings.transferQrImage && shouldSendTransferQr(text, reply)
      );

      return {
        reply,
        mode: maybeOrder ? "order_created" : "ai",
        mediaUrl: shouldSendQr ? settings.transferQrImage : undefined,
        invoiceUrl: maybeOrder?.invoiceUrl,
        invoicePdfUrl: maybeOrder?.invoicePdfUrl,
        invoiceNumber: maybeOrder?.invoiceNumber,
      };
    } catch (openaiErr: any) {
      console.warn("[sales-agent] OpenAI falló (cuota o error de red); usando fallback inteligente de BUÑUELANDIA", openaiErr?.message || openaiErr);
    }
  }

  // 4. Fallback Inteligente y Contextual de BUÑUELANDIA (mantiene memoria y estado sin IA)
  let reply = "";
  let mode: SalesMessageResult["mode"] = "keyword";
  let createdInvoiceNumber: string | undefined = undefined;
  let createdInvoiceUrl: string | undefined = undefined;
  let createdInvoicePdfUrl: string | undefined = undefined;

  // IMPORTANTE: Extraer productos e intenciones de los mensajes del usuario (incluyendo notas de voz transcritas)
  const userChatText = [
    ...previous
      .filter((m) => m.role === "user" || (m.role === "system" && m.content.startsWith("🎤 [Nota de voz transcrita]:")))
      .map((m) => m.content.replace(/^🎤\s*\[Nota de voz(?: transcrita)?\]:\s*"?/i, "").replace(/"?\s*$/i, "")),
    text,
  ].join("\n");

  const isGreeting =
    lower === "hola" ||
    lower.startsWith("hola ") ||
    lower.includes("buenos días") ||
    lower.includes("buenas tardes") ||
    lower.includes("buenas noches");

  const isAskingCatalog =
    lower.includes("catálogo") ||
    lower.includes("catalogo") ||
    lower.includes("menú") ||
    lower.includes("menu") ||
    lower.includes("precios") ||
    lower.includes("productos");

  const isAskingDrinks =
    lower.includes("bebidas") ||
    lower.includes("bebida") ||
    lower.includes("de tomar") ||
    lower.includes("algo de tomar") ||
    lower.includes("qué tienen para tomar") ||
    lower.includes("que tienen para tomar");

  let foundAddress = extractAddress(text) || (previous.length > 0 ? extractAddress(userChatText) : null);

  // PREVENCIÓN DE BUCLES DE DIRECCIÓN:
  // Si no coincidió con una regla regex estricta, verificar si el bot acababa de pedir la dirección en el mensaje anterior.
  // En ese caso, si el usuario respondió con un texto de ubicación (no saludo, no cancelar, no pago directo), se toma como dirección.
  if (!foundAddress) {
    const lastAssistantMsg = previous.filter((m) => m.role === "assistant").pop()?.content || "";
    const assistantJustAskedAddress =
      lastAssistantMsg.toLowerCase().includes("dirección") ||
      lastAssistantMsg.toLowerCase().includes("direccion") ||
      lastAssistantMsg.toLowerCase().includes("conjunto o vereda") ||
      lastAssistantMsg.toLowerCase().includes("donde te lo enviamos") ||
      lastAssistantMsg.toLowerCase().includes("dónde te lo enviamos") ||
      lastAssistantMsg.toLowerCase().includes("para enviártelo") ||
      lastAssistantMsg.toLowerCase().includes("para enviartelo");

    if (assistantJustAskedAddress) {
      const cand = cleanAddressCandidate(text);
      if (
        cand &&
        !isGreeting &&
        !isAskingCatalog &&
        !isAskingDrinks &&
        !lower.includes("cancelar") &&
        !lower.includes("asesor") &&
        !lower.includes("humano") &&
        !extractPaymentMethod(text)
      ) {
        foundAddress = cand;
      }
    }
  }

  const foundPayment = extractPaymentMethod(text) || (previous.length > 0 ? extractPaymentMethod(userChatText) : null);
  const { items: extractedItems, total: extractedTotal } = extractProductsFromText(userChatText, products);

  if (isGreeting || isNewOrderIntent) {
    const items = products
      .filter((p) => p.sku.startsWith("C"))
      .map((p) => `• *${p.name}:* ${formatCop(p.price)}`)
      .join("\n");
    const drinksHint = upsellDrinks ? "\n\n☕🥤 _También tenemos café campesino, chocolate caliente, gaseosas y jugos naturales para acompañar._" : "";
    reply = `${settings.welcomeMessage}\n\n📦 *Nuestras Cajas:*\n${items}${drinksHint}\n\n¿Qué caja te gustaría pedir hoy?`;
  } else if (isAskingCatalog) {
    const items = products
      .map((p) => `• *${p.name}*\n  Precio: ${formatCop(p.price)} - _${p.description || "Delicioso y crujiente"}_`)
      .join("\n\n");
    reply = `🧀 *Menú Oficial de BUÑUELANDIA:*\n\n${items}\n\nPara pedir, indícanos qué productos deseas (ejemplo: *1 CAJA x8 Surtida y 1 Jugo de Mora*).`;
  } else if (isAskingDrinks && upsellDrinks) {
    reply = `☕🥤 *Menú de Bebidas en BUÑUELANDIA:*\n\n☕ *Bebidas Calientes:*\n• *Café Campesino recién colado:* $3.500\n• *Chocolate Caliente Tradicional:* $4.000\n\n🥤 *Bebidas Frías:*\n• *Gaseosa 400ml helada:* $4.500 (Coca-Cola, Colombiana, Manzana)\n• *Jugo Natural de Mora:* $6.000\n• *Agua Mineral 500ml:* $3.000\n\n¿Deseas agregar alguna bebida a tus buñuelos? 🤤`;
  } else if (!hasActiveOrder && extractedItems.length > 0 && foundAddress && foundPayment) {
    const finalItems = extractedItems;
    const finalTotal = extractedTotal;
    const finalPayment = foundPayment;
    const finalAddress = foundAddress;
    const clientName = pushName || `Cliente WhatsApp ${conversationKey.replace(/[^0-9]/g, "").slice(-4) || ""}`;

    const lastAssistantMsg = previous.filter((m) => m.role === "assistant").pop()?.content || "";
    const isPreviousPreConfirmation =
      lastAssistantMsg.includes("1️⃣") &&
      (lastAssistantMsg.toLowerCase().includes("confirmar pedido") || lastAssistantMsg.toLowerCase().includes("modificar"));

    const isUserConfirming =
      lower === "1" ||
      lower.startsWith("1.") ||
      lower.startsWith("1 ") ||
      lower.includes("confirmar") ||
      lower.includes("confirmo") ||
      lower.includes("confirmado") ||
      lower === "si" ||
      lower === "sí" ||
      lower === "dale" ||
      lower === "de una";

    const isUserModifying =
      lower === "2" ||
      lower.startsWith("2.") ||
      lower.startsWith("2 ") ||
      lower.includes("modificar") ||
      lower.includes("cambiar");

    if (isPreviousPreConfirmation && isUserModifying) {
      reply = `¡Claro que sí! 🥟✏️ Cuéntanos qué dato te gustaría modificar: ¿los productos, la dirección de entrega o el medio de pago?`;
    } else if (!isPreviousPreConfirmation && !isUserConfirming) {
      // PASO 6: RESUMEN PREVIO (Pre-confirmación)
      const itemsListText = finalItems.map((it) => `• ${it.name} x${it.quantity}: ${formatCop(it.unitPrice * it.quantity)}`).join("\n");
      reply = `📋 *Resumen de tu Pedido:*\n${itemsListText}\n\n📦 *Subtotal productos:* ${formatCop(finalTotal)}\n🛵 *Domicilio:* ¡GRATIS!\n💰 *Total a pagar:* ${formatCop(finalTotal)}\n📍 *Dirección de entrega:* ${finalAddress}\n💳 *Medio de pago:* ${finalPayment}\n\n¿Todo está correcto? Elige una opción:\n1️⃣ ✅ Confirmar pedido\n2️⃣ ✏️ Modificar algún dato`;
    } else {
      // PASO 7: CONFIRMACIÓN OFICIAL Y FACTURACIÓN (Solo tras responder 1 o confirmar)
      const order = await createOrder(
        conversationKey,
        finalItems.map((it) => ({ sku: it.sku, quantity: it.quantity, unitPrice: it.unitPrice })),
        finalTotal,
        {
          customerName: clientName,
          deliveryAddress: finalAddress,
          paymentMethod: finalPayment,
          itemsSummary: finalItems.map((it) => `${it.sku} x${it.quantity}`).join(", "),
          deliveryFee: 0,
        }
      );

      if (clientName && !clientName.toLowerCase().startsWith("cliente whatsapp")) {
        await setConversationCustomerName(conversationKey, clientName).catch(() => {});
      }

      let invoiceNotice = "";
      try {
        const invRes = await createInvoiceInContabilidad({
          orderId: order.id,
          customerName: clientName,
          phone: conversationKey.replace(/^whatsapp:/i, ""),
          deliveryAddress: finalAddress,
          paymentMethod: finalPayment,
          items: finalItems.map((it) => ({
            sku: it.sku,
            name: it.name,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
          })),
          deliveryFee: 0,
          total: finalTotal,
        });
        if (invRes.ok && invRes.invoiceNumber) {
          await updateOrderInvoice(
            order.id,
            invRes.invoiceNumber,
            invRes.invoiceId,
            invRes.invoiceUrl,
            invRes.invoicePdfUrl
          );
          order.invoiceNumber = invRes.invoiceNumber;
          order.invoiceId = invRes.invoiceId;
          order.invoiceUrl = invRes.invoiceUrl;
          order.invoicePdfUrl = invRes.invoicePdfUrl;
          createdInvoiceNumber = invRes.invoiceNumber;
          createdInvoiceUrl = invRes.invoiceUrl;
          createdInvoicePdfUrl = invRes.invoicePdfUrl;
          const publicUrl = invRes.invoiceUrl || `https://contabilidad-app-fawn.vercel.app/api/invoices/public/${invRes.invoiceId || ""}`;
          invoiceNotice = `\n🧾 *Factura Oficial Registrada:* #${invRes.invoiceNumber}\n📄 *Ver tu Factura digital:* ${publicUrl}`;
        }
      } catch (invErr) {
        console.warn("[sales-agent] Error generando factura en fallback:", invErr);
      }

      // Notificar automáticamente al domiciliario asignado por WhatsApp
      notifyDeliveryDriver(order).catch((dErr) => {
        console.warn("[sales-agent] Error notificando al domiciliario en fallback:", dErr);
      });

      const itemsListText = finalItems.map((it) => `- ${it.name} x${it.quantity}: ${formatCop(it.unitPrice * it.quantity)}`).join("\n");

      reply = `✅ *¡Pedido Confirmado y Registrado en BUÑUELANDIA!* 🥟\n\nNúmero de pedido: *#${order.id.slice(0, 8)}*${invoiceNotice}\n\n📋 *Detalle del Pedido:*\n${itemsListText}\n\n💵 *Total a pagar:* ${formatCop(finalTotal)}\n🛵 *Domicilio:* ¡GRATIS!\n📍 *Dirección de entrega:* ${finalAddress}\n💳 *Medio de pago:* ${finalPayment}\n👤 *Cliente:* ${clientName}\n\n🛵 ¡Tus buñuelos van en camino calienticos y crujientes! Muchas gracias por preferirnos.`;
      mode = "order_created";
    }
  } else if (extractedItems.length > 0) {
    const chosenProduct = extractedItems[0];
    const totalEst = extractedTotal > 0 ? extractedTotal : chosenProduct.unitPrice;

    // VALIDACIÓN OBLIGATORIA DE SALSAS PARA CAJAS SURTIDAS (C4S / C8S)
    const hasSurtida = extractedItems.some((it) => it.sku === "C4S" || it.sku === "C8S");
    const mentionsSauces =
      lower.includes("mora") ||
      lower.includes("arequipe") ||
      lower.includes("bocadillo") ||
      lower.includes("suero") ||
      lower.includes("queso") ||
      userChatText.toLowerCase().includes("mora") ||
      userChatText.toLowerCase().includes("arequipe") ||
      userChatText.toLowerCase().includes("bocadillo") ||
      userChatText.toLowerCase().includes("suero");

    if (hasSurtida && !mentionsSauces) {
      reply = `¡Excelente elección con tu caja surtida! 🤤 ¿Qué salsas prefieres para acompañar tus buñuelos? Tenemos Mora, Arequipe, Bocadillo y Suero Costeño (puedes combinarlas como prefieras).`;
    } else {
      // Verificar si ya tiene bebida o ya se le ofreció
      const hasDrinkInCart = extractedItems.some((it) => it.sku.startsWith("BEB"));
      const alreadyAskedDrinks = previous.some(
        (m) => m.role === "assistant" && (m.content.includes("acompañar tus buñuelos") || m.content.includes("bebida bien fría"))
      );
      const hasDeclinedDrinks =
        lower.includes("sin bebida") ||
        lower.includes("no quiero bebida") ||
        lower.includes("no gracias") ||
        lower.includes("solo los buñuelos") ||
        lower.includes("solo buñuelos") ||
        lower === "no";

      if (upsellDrinks && !hasDrinkInCart && !alreadyAskedDrinks && !hasDeclinedDrinks) {
        reply = `¡Excelente elección! 🤤 Tomamos nota de tu pedido:\n• *${chosenProduct.name}* (${formatCop(totalEst)})\n\n¿Te gustaría acompañar tus buñuelos con alguna bebida bien fría o caliente? ☕🥤\n• *Café Campesino:* $3.500\n• *Chocolate Caliente:* $4.000\n• *Gaseosa helada:* $4.500\n• *Jugo de Mora:* $6.000\n• *Agua Mineral:* $3.000\n\n_(Indícanos qué bebida deseas agregar, o compártenos tu dirección si solo deseas los buñuelos)_ 🥟`;
      } else if (!foundAddress) {
        reply = `¡Perfecto! 🤤 Tenemos anotado:\n• *${chosenProduct.name}* (${formatCop(totalEst)})\n\nPara enviártelo calientito a tu casa, por favor compártenos:\n📍 *Dirección exacta de Entrega, Conjunto o Vereda*\n🏢 *Indicaciones de entrega (torre/apto/casa/portería)*`;
      } else {
        reply = `¡Excelente! Ya tenemos tu dirección: *${foundAddress}* 📍\n\nPor favor indícanos con qué medio de pago deseas cancelar:\n1️⃣ *Nequi*\n2️⃣ *Bre-B*\n3️⃣ *Efectivo contra entrega*`;
      }
    }
  } else if (foundAddress && !foundPayment) {
    reply = `¡Perfecto! Ya tenemos tu dirección: *${foundAddress}* 📍\n\n¿Qué buñuelos o bebidas deseas agregar a tu pedido? (Escribe *catálogo* para ver las opciones).`;
  } else if (previous.length > 1) {
    reply = `¡Con gusto! Para tomar tu pedido en BUÑUELANDIA, indícanos qué productos deseas (ej: *1 Caja x8 Surtida*), o escribe *catálogo* si deseas ver todas las opciones.`;
  } else {
    reply = `${settings.welcomeMessage}\n\nPuedes escribir *catálogo*, *hacer pedido* o *escalar a humano* para que te atienda un asesor.`;
  }

  const shouldSendQr = Boolean(
    settings.transferQrImage && shouldSendTransferQr(text, reply)
  );

  await appendMessage(conversationKey, "assistant", reply);
  return {
    reply,
    mode,
    mediaUrl: shouldSendQr ? settings.transferQrImage : undefined,
    invoiceUrl: createdInvoiceUrl,
    invoicePdfUrl: createdInvoicePdfUrl,
    invoiceNumber: createdInvoiceNumber,
  };
}
