import {
  appendMessage,
  createOrder,
  getMessages,
  getOrders,
  getOrgSettings,
  getProducts,
  setConversationStatus,
  setConversationCustomerName,
  type Message,
  type Product,
} from "@/lib/store";

export interface SalesMessageResult {
  reply: string;
  mode: "ai" | "keyword" | "human_escalated" | "order_created";
  mediaUrl?: string;
  mediaCaption?: string;
}

function formatCop(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Extrae direcciones colombianas típicas sin saltar líneas ni capturar medios de pago
function extractAddress(text: string): string | null {
  if (!text) return null;
  const lines = text.split(/[\r\n]+/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1. Etiqueta directa en la línea: "Dirección: Cra 3a 7 26"
    const labeledMatch = trimmed.match(
      /^(?:📍\s*)?(?:direcci[oó]n|enviar a|para la|despachar a)[:\s]+([^,\n]+)/i
    );
    if (labeledMatch && labeledMatch[1]) {
      const val = labeledMatch[1].trim();
      if (val.length >= 4 && !val.toLowerCase().includes("indicada en chat")) return val;
    }

    // 2. Nomenclatura urbana colombiana en la línea
    // Ej: Cra 3a 7 26 / Calle 45 # 12-30 / Carrera 80 No 25 10 / Av 19 # 100-20
    const streetMatch = trimmed.match(
      /(?:calle|cll|cra|carrera|diagonal|diag|transversal|trans|av|avenida)\s+\d+[a-zA-Z]?\s*(?:#|no|nro|número|\s)?\s*\d+[a-zA-Z]?\s*[-–\s]\s*\d+(?:\s*(?:apto|int|torre|casa|barrio|piso)\s*[^.,\n]*)?/i
    );
    if (streetMatch) return streetMatch[0].trim();
  }

  // 3. Búsqueda en texto completo si viene en un solo bloque
  const fallbackMatch = text.match(
    /(?:calle|cll|cra|carrera|diagonal|diag|transversal|trans|av|avenida)\s+\d+[a-zA-Z]?\s*(?:#|no|nro|número|\s)?\s*\d+[a-zA-Z]?\s*[-–\s]\s*\d+(?:\s*(?:apto|int|torre|casa|barrio|piso)\s*[^.,\n]*)?/i
  );
  if (fallbackMatch) return fallbackMatch[0].trim();

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

  // Si el usuario eligió efectivo, JAMÁS enviar QR
  if (
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
  // Tomamos los últimos 8 mensajes
  for (const m of msgs.slice(-8)) {
    const role: "user" | "model" = m.role === "assistant" ? "model" : "user";
    const text = (m.content || "").trim();
    if (!text) continue;

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

  for (const m of msgs.slice(-8)) {
    const role = m.role === "assistant" ? "assistant" : "user";
    const content = (m.content || "").trim();
    if (!content) continue;
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
  const combined = (userText + " " + assistantReply).toLowerCase();

  const hasConfirmationKeyword =
    combined.includes("pedido confirmado") ||
    combined.includes("confirmado y registrado") ||
    combined.includes("pedido registrado") ||
    combined.includes("hemos registrado tu pedido") ||
    combined.includes("pedido creado") ||
    combined.includes("van en camino") ||
    combined.includes("sale en camino") ||
    combined.includes("preparando tus buñuelos") ||
    combined.includes("preparando tu pedido") ||
    (combined.includes("total a pagar") && (combined.includes("dirección") || combined.includes("direccion") || combined.includes("calle") || combined.includes("cra")));

  if (!hasConfirmationKeyword) return null;

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
    /(?:📍\s*)?\*?Direcci[oó]n(?: de entrega)?:\*?\s*([^\n\r*]+)/i
  );
  if (assistantAddrMatch && assistantAddrMatch[1]) {
    const cand = assistantAddrMatch[1].replace(/^[\[\(]|[\]\)]$/g, "").trim();
    if (cand.length >= 4 && !cand.toLowerCase().includes("indicada en chat") && !cand.toLowerCase().includes("ingresada")) {
      address = cand;
    }
  }
  // Si no está en el asistente, extraer del mensaje del usuario
  if (!address) {
    address = extractAddress(userText);
  }
  if (!address) {
    address = "Dirección indicada en chat";
  }

  // 2. Extraer nombre del cliente
  let customerName = clientName;
  const assistantNameMatch = assistantReply.match(
    /(?:👤\s*)?\*?Cliente:\*?\s*([^\n\r*]+)/i
  );
  if (assistantNameMatch && assistantNameMatch[1]) {
    const cand = assistantNameMatch[1].replace(/^[\[\(]|[\]\)]$/g, "").trim();
    if (
      cand.length >= 2 &&
      !cand.toLowerCase().includes("cliente") &&
      !cand.toLowerCase().includes("nombre del cliente")
    ) {
      customerName = cand;
    }
  }
  if (!customerName || customerName.toLowerCase().startsWith("cliente whatsapp")) {
    const lines = userText.split(/[\r\n]+/);
    for (const l of lines) {
      const nm = l.match(/(?:mi nombre es|nombre(?:\s+completo)?:\s*|soy\s+)([a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{3,35})/i);
      if (nm && nm[1]) {
        const cand = nm[1].trim();
        if (!cand.toLowerCase().includes("nequi") && !cand.toLowerCase().includes("breb") && !cand.toLowerCase().includes("efectivo")) {
          customerName = cand;
          break;
        }
      }
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

  // 6. Extraer costo de domicilio
  let detectedFee = 0;
  const feeMatch = assistantReply.match(/(?:🛵\s*)?\*?(?:Costo de )?Domicilio:\*?\s*(?:COP|\$)?\s*([\d.,]+|gratis)/i);
  if (feeMatch && feeMatch[1]) {
    if (!feeMatch[1].toLowerCase().includes("gratis")) {
      detectedFee = parseInt(feeMatch[1].replace(/[.,]/g, ""), 10) || 0;
    }
  }

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

  // Filtrar el historial si el pedido anterior ya fue entregado o cancelado,
  // para que la IA no intente cobrarle de nuevo los productos del pedido anterior
  const rawPrevious = await getMessages(conversationKey);
  let previous = rawPrevious;
  if (latestOrder && (latestOrder.status === "delivered" || latestOrder.status === "cancelled")) {
    const orderTime = latestOrder.createdAt || 0;
    const sinceOrder = rawPrevious.filter((m) => m.createdAt > orderTime);
    previous = sinceOrder;
  }
  const catalogText = products
    .map((p) => `- ${p.name}: ${formatCop(p.price)} (${p.description || "Deliciosos y frescos"})`)
    .join("\n");

  const nequiNumber = settings.nequiNumber || "3228964947";
  const brebKey = settings.brebKey || "3228964947";
  const deliveryFee = parseInt(settings.deliveryFee || "4000", 10) || 4000;
  const freeThreshold = parseInt(settings.freeDeliveryThreshold || "40000", 10) || 40000;
  const etaTime = settings.estimatedDeliveryTime || "30 a 45 minutos";

  const upsellDrinks = settings.upsellDrinksEnabled !== "false";

  const systemPrompt = `Eres el asistente virtual y vendedor estrella por WhatsApp de "${settings.name}".

  🎭 PERSONALIDAD Y TONO:
  ¡Eres MUY carismático, alegre, persuasivo y antojador! Tu objetivo principal es: ${settings.botObjective || "vender y hacer agua la boca del cliente."} 
  - Usa MUCHOS EMOJIS en todos tus mensajes (👋✨🤤📦🧀🍯🇨🇴).
  - Usa expresiones amigables y típicas (ej: "¡Uff, excelente elección!", "¡Qué delicia!", "para chuparse los dedos").
  - Habla de lo "calientitos, doraditos y súper crujientes" que están los buñuelos.
  - Aunque tus reglas son estrictas, tu forma de hablar debe ser súper amena, divertida y NADA robótica.

  Reglas del negocio: ${settings.rules}

  🔥 CATÁLOGO ESTRICTO (Precios en COP):
  ${catalogText}
  ¡REGLA DE ORO!: NO inventes productos, tamaños ni sabores que no estén en este catálogo. Solo vendemos cajas de 4 o de 8, y las bebidas del menú.

  📌 FLUJO DE VENTA PASO A PASO (Sigue este orden estrictamente):
  1. SALUDO Y MENÚ: Inicia SIEMPRE con mucho entusiasmo (ej. "¡Hola, hola! 🥳 ¡Bienvenido a *BUÑUELANDIA*! 🥟🔥"). Antoja al cliente y muéstrale nuestras Cajas Tradicionales y Surtidas.
  2. ELECCIÓN Y SALSAS: 
     - Si el cliente elige una caja "Tradicional", es sin salsa, pasa al paso 3.
     - Si el cliente elige una caja "Surtida", TIENES QUE PREGUNTARLE QUÉ SALSAS QUIERE (Mora, Arequipe, Bocadillo, Suero Costeño). Puedes mezclarlas como prefiera.
  ${upsellDrinks ? `3. VENTA CRUZADA Y CATÁLOGO DE BEBIDAS:
     - Justo después de que el cliente elija su caja (y salsas si aplica), antes de pedir la dirección, pregúntale amigablemente si desea agregar bebidas para acompañar:
       «¿Te gustaría acompañar tus buñuelos con alguna bebida bien fría o caliente? ☕🥤 Tenemos café campesino recién colado ($3.500), chocolate caliente tradicional ($4.000), gaseosa bien helada ($4.500), jugo natural de mora ($6.000) o agua ($3.000).»
     - Si el cliente pregunta en cualquier momento por bebidas (ej: "¿qué bebidas tienen?", "¿tienen algo de tomar?", "muéstrame las bebidas"), preséntale con entusiasmo el catálogo completo:
       ☕ *Bebidas Calientes:*
       • Café Campesino recién colado ($3.500)
       • Chocolate Caliente Tradicional ($4.000)
       🥤 *Bebidas Frías:*
       • Gaseosa 400ml helada ($4.500) (Coca-Cola, Colombiana, Manzana)
       • Jugo Natural de Mora ($6.000)
       • Agua Mineral 500ml ($3.000)
     - Si el cliente acepta alguna bebida, agrégala con su precio al pedido; si dice que no, avanza inmediatamente al paso 4 sin insistir.` : `3. BEBIDAS DESACTIVADAS (NO OFRECER BEBIDAS):
     - El interruptor de venta de bebidas está APAGADO. NO ofrezcas, NO sugieras ni menciones bebidas activamente al cliente. Pasa DIRECTAMENTE al paso 4 (Recolección de datos de entrega).`}
  4. RECOLECCIÓN DE DATOS DE ENTREGA:
     - Pide: 📍 Dirección exacta de entrega (con barrio) y 🏢 Indicaciones especiales de entrega (ej: torre, apto, dejar en portería o si el timbre no funciona).
  5. MEDIO DE PAGO Y COSTO DE DOMICILIO:
     - Informa sobre el domicilio: Tarifa fija de ${formatCop(deliveryFee)} (o ¡GRATIS si el pedido supera ${formatCop(freeThreshold)}!).
     - Opciones de pago:
       1️⃣ *Nequi*
       2️⃣ *Bre-B*
       3️⃣ *Efectivo contra entrega*
     - SI ELIGE NEQUI O BRE-B (o pide QR/transferencia):
       Infórmale alegremente que le envías el código QR oficial de pago y OBLIGATORIAMENTE incluye este bloque en texto limpio con acento grave para que el cliente pueda copiar el número con un solo toque:
       📱 *Nequi:* \`${nequiNumber}\`
       🔑 *Llave Bre-B:* \`${brebKey}\`
       💰 *Total exacto a pagar:* [Total con domicilio incluido]
       *(Toca y mantén presionado el número para copiarlo rápidamente a tu app bancaria)*
     - SI ELIGE EFECTIVO:
       Pregúntale: «¿Con qué billete vas a pagar? (ej: billete de $50.000 o monto exacto) para que el domiciliario te lleve el cambio listo 💵»
  6. CONFIRMACIÓN FINAL: SÓLO cuando tengas los productos, la dirección Y el medio de pago, enviarás el resumen final usando ESTE FORMATO EXACTO:

  ✅ *¡Pedido Confirmado y Registrado en BUÑUELANDIA!* 🛵🥟

  🛒 *Detalle del Pedido:*
  [Lista de productos x cantidad, salsas y bebidas si aplica]

  📦 *Subtotal productos:* [Subtotal exacto en COP]
  🛵 *Costo de domicilio:* [${formatCop(deliveryFee)} o ¡GRATIS!]
  💰 *Total a pagar:* [Total exacto con domicilio en COP]
  📍 *Dirección de entrega:* [Dirección ingresada]
  🏢 *Notas de entrega:* [Indicaciones de torre/apto/portería o "Ninguna"]
  💳 *Medio de pago:* [Medio ingresado, y si es efectivo con cuánto paga y cambio]
  👤 *Cliente:* [Nombre del cliente o "Cliente"]
  ⏱️ *Tiempo estimado de entrega:* ${etaTime}

  🔥 ¡Tus buñuelos van en camino calienticos y crujientes! ¡Gracias por tu compra en BUÑUELANDIA! 🥟

  ⛔ RESTRICCIONES IMPORTANTES:
  - YA NO SE VENDE POR UNIDAD. SOLO SE VENDEN CAJAS DE 4 O DE 8. Si alguien pide unidades sueltas (ej: "quiero 2 buñuelos"), explícale amablemente que solo manejamos cajas de 4 o de 8.
  - NUNCA inventes precios ni sumes mal.
  - NO confirmes el pedido hasta tener dirección, método de pago y las salsas elegidas si pidió una caja surtida.
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
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
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

          const reply = response.text?.trim() || settings.welcomeMessage;
          await appendMessage(conversationKey, "assistant", reply);

          const maybeOrder = await tryExtractAndRegisterOrder(
            conversationKey,
            text,
            reply,
            products,
            pushName
          );

          const shouldSendQr = Boolean(
            settings.transferQrImage && shouldSendTransferQr(text, reply)
          );

          return {
            reply,
            mode: maybeOrder ? "order_created" : "ai",
            mediaUrl: shouldSendQr ? settings.transferQrImage : undefined,
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

      const reply = res.choices[0]?.message?.content?.trim() || settings.welcomeMessage;
      await appendMessage(conversationKey, "assistant", reply);

      const maybeOrder = await tryExtractAndRegisterOrder(
        conversationKey,
        text,
        reply,
        products,
        pushName
      );

      const shouldSendQr = Boolean(
        settings.transferQrImage && shouldSendTransferQr(text, reply)
      );

      return {
        reply,
        mode: maybeOrder ? "order_created" : "ai",
        mediaUrl: shouldSendQr ? settings.transferQrImage : undefined,
      };
    } catch (openaiErr: any) {
      console.warn("[sales-agent] OpenAI falló (cuota o error de red); usando fallback inteligente de BUÑUELANDIA", openaiErr?.message || openaiErr);
    }
  }

  // 4. Fallback Inteligente y Contextual de BUÑUELANDIA (mantiene memoria y estado sin IA)
  let reply = "";
  let mode: SalesMessageResult["mode"] = "keyword";

  const allChatText = [...previous.map((m) => m.content), text].join("\n");
  const foundAddress = extractAddress(text) || extractAddress(allChatText);
  const foundPayment = extractPaymentMethod(text) || extractPaymentMethod(allChatText);
  const { items: extractedItems, total: extractedTotal } = extractProductsFromText(allChatText, products);

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

  const isAffirmation =
    lower === "esa" ||
    lower === "sí" ||
    lower === "si" ||
    lower === "dale" ||
    lower === "de una" ||
    lower === "ok" ||
    lower === "listo" ||
    lower.includes("quiero esa") ||
    lower.includes("esa misma") ||
    lower.includes("confirmo");

  if (isGreeting && previous.length <= 1) {
    reply = `${settings.welcomeMessage}\n\nEscribe *catálogo* para ver todos nuestros buñuelos y cajas surtidas o tradicionales, o dinos directamente qué deseas ordenar.`;
  } else if (isAskingCatalog) {
    const items = products
      .map((p) => `• *${p.name}*\n  Precio: ${formatCop(p.price)} - _${p.description || "Delicioso y crujiente"}_`)
      .join("\n\n");
    reply = `🧀 *Menú Oficial de BUÑUELANDIA:*\n\n${items}\n\nPara pedir, indícanos qué productos deseas (ejemplo: *1 CAJA x8 Surtida y 2 Buñuelos de Mora*).`;
  } else if (foundAddress && (foundPayment || isAffirmation || lower.includes("nequi") || lower.includes("breb") || lower.includes("bre-b") || lower.includes("efectivo") || lower.includes("daviplata"))) {
    // Si ya tenemos dirección y pago, o confirmación: ¡CERRAR PEDIDO CON ÉXITO!
    const defaultProduct = products.find((p) => p.sku === "C8S") || products[0];
    const finalItems = extractedItems.length > 0 ? extractedItems : [{ sku: defaultProduct.sku, name: defaultProduct.name, quantity: 1, unitPrice: defaultProduct.price }];
    const finalTotal = extractedTotal > 0 ? extractedTotal : defaultProduct.price;
    const finalPayment = foundPayment || "Efectivo contra entrega";
    const finalAddress = foundAddress;
    const clientName = pushName || `Cliente WhatsApp ${conversationKey.replace(/[^0-9]/g, "").slice(-4) || ""}`;

    const order = await createOrder(
      conversationKey,
      finalItems.map((it) => ({ sku: it.sku, quantity: it.quantity, unitPrice: it.unitPrice })),
      finalTotal,
      {
        customerName: clientName,
        deliveryAddress: finalAddress,
        paymentMethod: finalPayment,
        itemsSummary: finalItems.map((it) => `${it.sku} x${it.quantity}`).join(", "),
      }
    );

    if (clientName && !clientName.toLowerCase().startsWith("cliente whatsapp")) {
      await setConversationCustomerName(conversationKey, clientName).catch(() => {});
    }

    const itemsListText = finalItems.map((it) => `- ${it.name} x${it.quantity}: ${formatCop(it.unitPrice * it.quantity)}`).join("\n");

    reply = `✅ *¡Pedido Confirmado y Registrado en BUÑUELANDIA!* 🥟\n\nNúmero de pedido: *#${order.id.slice(0, 8)}*\n\n📋 *Detalle del Pedido:*\n${itemsListText}\n\n💵 *Total a pagar:* ${formatCop(finalTotal)}\n📍 *Dirección de entrega:* ${finalAddress}\n💳 *Medio de pago:* ${finalPayment}\n👤 *Cliente:* ${clientName}\n\n🛵 ¡Tus buñuelos van en camino calienticos y crujientes! Muchas gracias por preferirnos.`;
    mode = "order_created";
  } else if (extractedItems.length > 0 || isAffirmation || lower.includes("caja") || lower.includes("buñuelo") || lower.includes("quiero") || lower.includes("pedido")) {
    const chosenProduct = extractedItems[0] || products.find((p) => p.sku === "C8S") || products[0];
    const totalEst = extractedTotal > 0 ? extractedTotal : chosenProduct.unitPrice;
    reply = `¡Excelente elección! 🤤 Hemos tomado nota de tu selección:\n• *${chosenProduct.name}* (${formatCop(totalEst)})\n\nPara enviarte tu pedido calientico, por favor facilítanos:\n1. 👤 *Tu Nombre Completo*\n2. 📍 *Dirección exacta de Entrega y Barrio*\n3. 💵 *Medio de Pago*:\n   1️⃣ *Nequi*\n   2️⃣ *Bre-B*\n   3️⃣ *Efectivo contra entrega*`;
  } else if (foundAddress && !foundPayment) {
    reply = `¡Perfecto! Ya tenemos tu dirección: *${foundAddress}* 📍\n\nPor favor indícanos con qué medio de pago deseas cancelar:\n1️⃣ *Nequi*\n2️⃣ *Bre-B*\n3️⃣ *Efectivo contra entrega*`;
  } else if (previous.length > 1) {
    // Si ya hay conversación previa, NO reiniciar al saludo de bienvenida
    reply = `¡Con gusto! Para confirmar tu pedido en BUÑUELANDIA, por favor compártenos tu *Dirección de entrega* y *Medio de pago* (1️⃣ Nequi, 2️⃣ Bre-B o 3️⃣ Efectivo contra entrega), o escribe *catálogo* si deseas ver más opciones.`;
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
  };
}
