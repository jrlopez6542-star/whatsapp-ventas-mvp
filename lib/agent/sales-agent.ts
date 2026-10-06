import {
  appendMessage,
  createOrder,
  getMessages,
  getOrgSettings,
  getProducts,
  setConversationStatus,
  type Message,
  type Product,
} from "@/lib/store";

export interface SalesMessageResult {
  reply: string;
  mode: "ai" | "keyword" | "human_escalated" | "order_created";
}

function formatCop(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Extrae direcciones colombianas típicas
function extractAddress(text: string): string | null {
  const match = text.match(
    /(?:direcci[oó]n|enviar a|para la|despachar a|calle|carrera|cra|cll|diagonal|diag|transversal|trans|av|avenida|manzana|mz|barrio|apto|casa|conjunto)[^:\n,.]*[:\s]+([^.\n,]+(?:\s+[^.\n,]+)*)/i
  );
  if (match) return match[1].trim();

  // Buscar nomenclaturas comunes ej: Calle 45 # 12-30 o Cra 80 No 25-10
  const streetMatch = text.match(/(?:calle|cll|cra|carrera|diagonal|diag|transversal|trans|av|avenida)\s+\d+[a-zA-Z]?\s*(?:#|no|nro|número)?\s*\d+[a-zA-Z]?\s*[-–]\s*\d+(?:\s*(?:apto|int|torre|casa|barrio)\s*[^.,\n]*)?/i);
  if (streetMatch) return streetMatch[0].trim();

  return null;
}

// Extrae medio de pago colombiano
function extractPaymentMethod(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes("nequi")) return "Nequi";
  if (lower.includes("daviplata")) return "Daviplata";
  if (lower.includes("efectivo") || lower.includes("contra entrega") || lower.includes("contraentrega")) return "Efectivo contra entrega";
  if (lower.includes("bancolombia") || lower.includes("transferencia")) return "Transferencia Bancolombia";
  return null;
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

  if (detectedTotal === 0) {
    const totalMatch = combined.match(/total[^\d]*?(\d[\d.,]*)/i);
    if (totalMatch) {
      detectedTotal = parseInt(totalMatch[1].replace(/[.,]/g, ""), 10);
    }
  }

  const address = extractAddress(combined) || "Dirección indicada en chat";
  const paymentMethod = extractPaymentMethod(combined) || "Efectivo contra entrega";
  const summary = orderItems.map((it) => `${it.sku} x${it.quantity}`).join(", ");
  const customerName = clientName || `Cliente WhatsApp ${conversationKey.replace(/[^0-9]/g, "").slice(-4) || ""}`;

  return await createOrder(conversationKey, orderItems, detectedTotal, {
    customerName,
    deliveryAddress: address,
    paymentMethod,
    itemsSummary: summary,
  });
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

  const previous = await getMessages(conversationKey);
  const catalogText = products
    .map((p) => `- ${p.name}: ${formatCop(p.price)} (${p.description || "Deliciosos y frescos"})`)
    .join("\n");

  const systemPrompt = `Eres el asistente virtual y vendedor estrella por WhatsApp de "${settings.name}".

🎭 PERSONALIDAD Y TONO:
¡Eres MUY carismático, alegre, persuasivo y antojador! Tu objetivo es vender y hacer agua la boca del cliente. 
- Usa MUCHOS EMOJIS en todos tus mensajes (👋✨🟡🤤📦🧀🍯🇨🇴).
- Usa expresiones amigables y típicas (ej: "¡Uff, excelente elección!", "¡Qué delicia!", "para chuparse los dedos").
- Habla de lo "calientitos, doraditos y súper crujientes" que están los buñuelos.
- Aunque tus reglas son estrictas, tu forma de hablar debe ser súper amena, divertida y NADA robótica.

Reglas del negocio: ${settings.rules}

📦 CATÁLOGO ESTRICTO (Precios en COP):
${catalogText}
¡REGLA DE ORO!: NO inventes productos, tamaños ni sabores que no estén en este catálogo. Solo vendemos lo que ves aquí.

🔄 FLUJO DE VENTA (Sigue este orden estrictamente):
1. SALUDO Y MENÚ: Inicia SIEMPRE con mucho entusiasmo (ej. "¡Hola, hola! 👋✨ ¡Bienvenido a *BUÑUELANDIA*! 🟡😋"). Antoja al cliente y muéstrale el catálogo de forma muy atractiva usando emojis para cada producto (🫐 para Mora, 🍯 para Arequipe, 🧀 para Queso, 🇨🇴 para Costeño, 📦 y 🎁 para Cajas).
2. CELEBRA LA ELECCIÓN Y COTIZA: Cuando el cliente elija, ¡celébralo! ("¡Uff, excelente elección! 🤤 Esa combinación es espectacular..."). Desglosa su pedido y el costo total. Sugiere cajas si pide varias unidades para que ahorre.
3. RECOLECCIÓN DE DATOS: Para despachar el pedido, es OBLIGATORIO pedir con amabilidad estos datos:
   - Dirección exacta de entrega (con barrio).
   - Medio de pago (Nequi, Daviplata, o Efectivo contra entrega).
   ⚠️ NO confirmes el pedido si falta la dirección o el pago. Pídelo amablemente ("Solo me falta un detallito para enviar tus buñuelos calientitos...").
4. CONFIRMACIÓN FINAL: SÓLO cuando tengas los productos, la dirección Y el medio de pago, enviarás el resumen final usando ESTE FORMATO EXACTO:

✅ *¡Pedido Confirmado y Registrado en BUÑUELANDIA!* 🥟✨

📋 *Detalle del Pedido:*
[Lista de productos x cantidad]

💵 *Total a pagar:* [Total exacto en COP]
📍 *Dirección de entrega:* [Dirección ingresada]
💳 *Medio de pago:* [Medio ingresado]
👤 *Cliente:* [Nombre del cliente o "Cliente"]

🛵 ¡Tus buñuelos van en camino calienticos y crujientes! ¡Gracias por tu compra en BUÑUELANDIA! 🥰

🛑 RESTRICCIONES IMPORTANTES:
- NUNCA inventes precios. Usa matemáticas simples.
- NUNCA des la confirmación final sin tener antes la dirección y el medio de pago.
- Si el cliente confirma un pedido (ej: "sí", "esa misma", "dale"), no repitas el saludo ni el catálogo: pregúntale a dónde se lo envías si no lo ha dicho.`;

  // 2. Intentar con Google Gemini (probando modelos disponibles: gemini-3.8-flash, gemini-2.0-flash, gemini-1.5-flash)
  if (process.env.GEMINI_API_KEY?.trim()) {
    const rawEnvModel = process.env.GEMINI_MODEL?.trim();
    const candidateGeminiModels = [
      rawEnvModel === "gemini-2.5-flash" ? "gemini-3.5-flash-lite" : rawEnvModel,
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
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

          return {
            reply,
            mode: maybeOrder ? "order_created" : "ai",
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

      return {
        reply,
        mode: maybeOrder ? "order_created" : "ai",
      };
    } catch (openaiErr: any) {
      console.warn("[sales-agent] OpenAI falló (cuota o error de red); usando fallback inteligente de BUÑUELANDIA", openaiErr?.message || openaiErr);
    }
  }

  // 4. Fallback Inteligente y Contextual de BUÑUELANDIA (mantiene memoria y estado sin IA)
  let reply = "";
  let mode: SalesMessageResult["mode"] = "keyword";

  const allChatText = [...previous.map((m) => m.content), text].join(" ");
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
  } else if (foundAddress && (foundPayment || isAffirmation || lower.includes("nequi") || lower.includes("efectivo") || lower.includes("daviplata"))) {
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

    const itemsListText = finalItems.map((it) => `- ${it.name} x${it.quantity}: ${formatCop(it.unitPrice * it.quantity)}`).join("\n");

    reply = `✅ *¡Pedido Confirmado y Registrado en BUÑUELANDIA!* 🥟\n\nNúmero de pedido: *#${order.id.slice(0, 8)}*\n\n📋 *Detalle del Pedido:*\n${itemsListText}\n\n💵 *Total a pagar:* ${formatCop(finalTotal)}\n📍 *Dirección de entrega:* ${finalAddress}\n💳 *Medio de pago:* ${finalPayment}\n👤 *Cliente:* ${clientName}\n\n🛵 ¡Tus buñuelos van en camino calienticos y crujientes! Muchas gracias por preferirnos.`;
    mode = "order_created";
  } else if (extractedItems.length > 0 || isAffirmation || lower.includes("caja") || lower.includes("buñuelo") || lower.includes("quiero") || lower.includes("pedido")) {
    const chosenProduct = extractedItems[0] || products.find((p) => p.sku === "C8S") || products[0];
    const totalEst = extractedTotal > 0 ? extractedTotal : chosenProduct.unitPrice;
    reply = `¡Excelente elección! 🤤 Hemos tomado nota de tu selección:\n• *${chosenProduct.name}* (${formatCop(totalEst)})\n\nPara enviarte tu pedido calientico, por favor facilítanos:\n1. 👤 *Tu Nombre Completo*\n2. 📍 *Dirección exacta de Entrega y Barrio*\n3. 💵 *Medio de Pago* (Nequi, Daviplata o Efectivo contra entrega)`;
  } else if (foundAddress && !foundPayment) {
    reply = `¡Perfecto! Ya tenemos tu dirección: *${foundAddress}* 📍\n\nPor favor indícanos con qué medio de pago deseas cancelar:\n- *Nequi*\n- *Daviplata*\n- *Efectivo contra entrega*`;
  } else if (previous.length > 1) {
    // Si ya hay conversación previa, NO reiniciar al saludo de bienvenida
    reply = `¡Con gusto! Para confirmar tu pedido en BUÑUELANDIA, por favor compártenos tu *Dirección de entrega* y *Medio de pago* (Nequi, Daviplata o Efectivo contra entrega), o escribe *catálogo* si deseas ver más opciones.`;
  } else {
    reply = `${settings.welcomeMessage}\n\nPuedes escribir *catálogo*, *hacer pedido* o *escalar a humano* para que te atienda un asesor.`;
  }

  await appendMessage(conversationKey, "assistant", reply);
  return { reply, mode };
}
