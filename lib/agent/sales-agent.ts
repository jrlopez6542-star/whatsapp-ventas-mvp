import {
  appendMessage,
  createOrder,
  getMessages,
  getOrgSettings,
  getProducts,
  setConversationStatus,
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

export async function handleSalesMessage(
  conversationKey: string,
  userText: string
): Promise<SalesMessageResult> {
  const text = (userText || "").trim();
  const lower = text.toLowerCase();

  const settings = await getOrgSettings();
  const products = await getProducts(true);

  // 1. Escalamiento a humano
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

  // 2. OpenAI si está configurado
  if (process.env.OPENAI_API_KEY?.trim()) {
    try {
      const { OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

      const previous = await getMessages(conversationKey);
      const catalogText = products
        .map((p) => `- [${p.sku}] ${p.name}: ${formatCop(p.price)} (${p.description || "Sin descripción"})`)
        .join("\n");

      const systemPrompt = `Eres el agente de ventas por WhatsApp de "${settings.name}".
Tono: ${settings.tone}.
Reglas de negocio: ${settings.rules}

Catálogo disponible en COP:
${catalogText}

Instrucciones:
1. Responde de forma clara, breve y amigable.
2. Si el cliente pregunta por productos o precios, usa únicamente los valores del catálogo en pesos colombianos (COP).
3. Si el cliente quiere comprar o cotizar, desglosa los productos, cantidades y el total.
4. Si pide hablar con una persona, dile que lo transferirás y usa la palabra clave "escalar a humano".
5. Si no sabes la respuesta o no está en el catálogo, indícalo amablemente sin inventar.`;

      const history = previous.slice(-8).map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));

      const res = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: text },
        ],
        temperature: 0.3,
        max_tokens: 450,
      });

      const reply = res.choices[0]?.message?.content?.trim() || settings.welcomeMessage;
      await appendMessage(conversationKey, "assistant", reply);
      return { reply, mode: "ai" };
    } catch (err) {
      console.warn("[sales-agent] OpenAI falló o no respondió; usando fallback de palabras clave", err);
    }
  }

  // 3. Fallback inteligente basado en palabras clave y catálogo
  let reply = "";
  let mode: SalesMessageResult["mode"] = "keyword";

  if (
    lower === "hola" ||
    lower.startsWith("hola") ||
    lower.includes("buenos días") ||
    lower.includes("buenas tardes")
  ) {
    reply = `${settings.welcomeMessage}\n\nEscribe *catálogo* para ver nuestros productos o dinos qué necesitas cotizar.`;
  } else if (
    lower.includes("catálogo") ||
    lower.includes("catalogo") ||
    lower.includes("productos") ||
    lower.includes("precios")
  ) {
    const items = products
      .map((p) => `• *${p.name}* (${p.sku})\n  Precio: ${formatCop(p.price)}`)
      .join("\n\n");
    reply = `📦 *Catálogo disponible:*\n\n${items}\n\nPara cotizar, escribe por ejemplo: *cotizar KIT-INI-01 x2*`;
  } else if (lower.includes("cotizar") || lower.includes("cotización") || lower.includes("cotizacion")) {
    const match = lower.match(/([a-z0-9-]+)\s*x\s*(\d+)/i);
    if (match) {
      const sku = match[1].toUpperCase();
      const qty = parseInt(match[2], 10) || 1;
      const product = products.find((p) => p.sku.toUpperCase() === sku);
      if (product) {
        const total = product.price * qty;
        reply = `📄 *Cotización:*\n• ${product.name} (${product.sku}) x ${qty} = ${formatCop(total)}\n\n*Total:* ${formatCop(total)}\n\n¿Deseas confirmar el pedido? Responde con *confirmar pedido*.`;
      } else {
        reply = `No encontré el producto con código *${sku}*. Escribe *catálogo* para ver los códigos disponibles.`;
      }
    } else {
      reply =
        "Para armarte una cotización exacta, por favor escribe el código del producto y la cantidad, ej: *cotizar KIT-INI-01 x2*.";
    }
  } else if (lower.includes("pedido") || lower.includes("confirmar pedido") || lower.includes("comprar")) {
    const defaultProduct = products[0];
    if (defaultProduct) {
      const order = await createOrder(
        conversationKey,
        [{ sku: defaultProduct.sku, quantity: 1, unitPrice: defaultProduct.price }],
        defaultProduct.price
      );
      reply = `✅ *¡Pedido registrado con éxito!*\nNúmero de pedido: #${order.id.slice(0, 8)}\nTotal: ${formatCop(defaultProduct.price)}\n\nPor favor envíanos tu dirección de entrega y nombre completo para coordinar el despacho.`;
      mode = "order_created";
    } else {
      reply = "Para crear un pedido, indícanos qué productos deseas del catálogo.";
    }
  } else if (lower.includes("bolsas") || lower.includes("kraft")) {
    const kraft = products.filter((p) => p.name.toLowerCase().includes("kraft") || p.sku.toLowerCase().includes("kraft"));
    if (kraft.length) {
      const list = kraft.map((p) => `• ${p.name}: ${formatCop(p.price)}`).join("\n");
      reply = `🛍️ *Opciones de bolsas kraft:*\n\n${list}\n\n¿Cuántos paquetes necesitas?`;
    } else {
      reply = "Actualmente no tenemos bolsas kraft en el catálogo activo.";
    }
  } else {
    reply = `${settings.welcomeMessage}\n\nPuedes escribir *catálogo*, *cotizar* o *escalar a humano* para atenderte.`;
  }

  await appendMessage(conversationKey, "assistant", reply);
  return { reply, mode };
}
