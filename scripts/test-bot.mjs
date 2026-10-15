#!/usr/bin/env node
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

// Cargar variables de entorno desde .env.local y .env
dotenv.config({ path: ".env.local" });
dotenv.config();

const TARGET_URL = (
  process.env.TARGET_URL ||
  process.argv[2] ||
  "https://whatsapp-ventas-mvp.vercel.app"
).replace(/\/$/, "");

const TEST_PHONE = "573009998877";
const REMOTE_JID = "573009998877@s.whatsapp.net";
const CONV_KEY = `whatsapp:+${TEST_PHONE}`;

// Formato y colores en consola
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Inicializar cliente Turso para verificación directa en base de datos
let db = null;
if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
  try {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL.trim(),
      authToken: process.env.TURSO_AUTH_TOKEN.trim(),
    });
  } catch (err) {
    console.warn(`${c.yellow}Aviso: No se pudo conectar directamente con @libsql/client, usando /api/sql${c.reset}`);
  }
}

async function querySql(query) {
  if (db) {
    const res = await db.execute(query);
    return res.rows || [];
  }
  const res = await fetch(`${TARGET_URL}/api/sql?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "SQL query failed");
  return data.rows || [];
}

async function executeSql(query) {
  if (db) {
    return await db.execute(query);
  }
  const res = await fetch(`${TARGET_URL}/api/sql?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "SQL execute failed");
  return data;
}

async function sendWebhookMessage(text) {
  const messageId = `test_msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const payload = {
    event: "messages.upsert",
    data: {
      key: {
        remoteJid: REMOTE_JID,
        fromMe: false,
        id: messageId,
      },
      pushName: "Cliente Prueba E2E",
      message: {
        conversation: text,
      },
    },
  };

  const res = await fetch(`${TARGET_URL}/api/webhooks/evolution`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-evolution-secret": process.env.EVOLUTION_API_KEY || "",
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json, messageId };
}

async function waitForAssistantReply(afterTimestamp, maxWaitMs = 15000) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const msgs = await querySql(
      `SELECT id, role, content, created_at FROM messages WHERE conversation_id LIKE '%${TEST_PHONE}%' AND role = 'assistant' AND created_at > ${afterTimestamp} ORDER BY created_at DESC LIMIT 1`
    );
    if (msgs.length > 0 && msgs[0].content) {
      return msgs[0];
    }
    await sleep(800);
  }
  return null;
}

async function waitForOrder(afterTimestamp, maxWaitMs = 18000) {
  const deadline = Date.now() + maxWaitMs;
  let lastOrder = null;
  while (Date.now() < deadline) {
    const orders = await querySql(
      `SELECT * FROM orders WHERE conversation_id LIKE '%${TEST_PHONE}%' AND created_at >= ${afterTimestamp - 2000} ORDER BY created_at DESC LIMIT 1`
    );
    if (orders.length > 0) {
      lastOrder = orders[0];
      if (lastOrder.invoice_number && lastOrder.invoice_number !== "null") {
        return lastOrder;
      }
    }
    await sleep(800);
  }
  return lastOrder;
}

async function run() {
  console.log(`\n${c.bright}${c.cyan}====================================================${c.reset}`);
  console.log(`${c.bright}${c.cyan}  🤖 TEST END-TO-END DE WHATSAPP VENTAS (BUÑUELANDIA)${c.reset}`);
  console.log(`${c.cyan}====================================================${c.reset}`);
  console.log(`🎯 Servidor objetivo: ${c.bright}${TARGET_URL}${c.reset}`);
  console.log(`📱 Teléfono de prueba: ${c.bright}+${TEST_PHONE}${c.reset}`);
  console.log(`🗄️ Base de datos:     ${db ? "Turso Directo (libsql)" : "Turso vía /api/sql"}\n`);

  let allPassed = true;

  // -------------------------------------------------------------
  // PASO 1: Reset Previo
  // -------------------------------------------------------------
  console.log(`${c.bright}PASO 1: Reset Previo${c.reset}`);
  console.log(`Borrando cualquier conversación, mensajes y pedidos previos del número +${TEST_PHONE}...`);
  try {
    await executeSql(`DELETE FROM orders WHERE conversation_id LIKE '%${TEST_PHONE}%'`);
    await executeSql(`DELETE FROM messages WHERE conversation_id LIKE '%${TEST_PHONE}%'`);
    await executeSql(`DELETE FROM conversations WHERE id LIKE '%${TEST_PHONE}%' OR phone LIKE '%${TEST_PHONE}%'`);
    await executeSql(`DELETE FROM outbound_conversation_locks WHERE conversation_key LIKE '%${TEST_PHONE}%'`).catch(() => {});
    await executeSql(`DELETE FROM webhook_receipts WHERE id LIKE '%${TEST_PHONE}%'`).catch(() => {});

    const prevMsgs = await querySql(`SELECT count(*) as c FROM messages WHERE conversation_id LIKE '%${TEST_PHONE}%'`);
    const prevOrders = await querySql(`SELECT count(*) as c FROM orders WHERE conversation_id LIKE '%${TEST_PHONE}%'`);

    const msgCount = Number(prevMsgs[0]?.c ?? prevMsgs[0]?.["count(*)"] ?? 0);
    const ordCount = Number(prevOrders[0]?.c ?? prevOrders[0]?.["count(*)"] ?? 0);

    if (msgCount === 0 && ordCount === 0) {
      console.log(`${c.green}✅ Reset previo completado: 0 mensajes y 0 pedidos en Turso.${c.reset}\n`);
    } else {
      throw new Error(`El reset no dejó la BD en 0 (mensajes: ${msgCount}, pedidos: ${ordCount})`);
    }
  } catch (err) {
    console.error(`${c.red}❌ Error en PASO 1 (Reset): ${err.message}${c.reset}\n`);
    process.exit(1);
  }

  // -------------------------------------------------------------
  // PASO 2: Test Ráfaga (Debounce)
  // -------------------------------------------------------------
  console.log(`${c.bright}PASO 2: Test Ráfaga (Debounce)${c.reset}`);
  console.log(`Disparando 3 peticiones POST /api/webhooks/evolution separadas por 500ms...`);
  try {
    const step2Start = Date.now();
    const p1 = sendWebhookMessage("Hola");
    console.log(`  [t=0ms]   Disparado: "Hola"`);
    await sleep(500);

    const p2 = sendWebhookMessage("Quiero una caja x8 surtida");
    console.log(`  [t=500ms] Disparado: "Quiero una caja x8 surtida"`);
    await sleep(500);

    const p3 = sendWebhookMessage("y un jugo de mora");
    console.log(`  [t=1000ms] Disparado: "y un jugo de mora"`);

    await Promise.all([p1, p2, p3]);

    console.log(`⏳ Esperando respuesta del bot (debounce + presencia + IA)...`);
    const replyMsg = await waitForAssistantReply(step2Start, 16000);
    if (!replyMsg) {
      throw new Error("Tiempo de espera agotado sin respuesta del bot tras ráfaga.");
    }

    // Consultar mensajes en Turso
    const msgs = await querySql(
      `SELECT role, content FROM messages WHERE conversation_id LIKE '%${TEST_PHONE}%' ORDER BY created_at ASC`
    );

    const userMsgs = msgs.filter((m) => m.role === "user");
    const assistantMsgs = msgs.filter((m) => m.role === "assistant");

    console.log(`📊 Mensajes registrados en Turso: ${userMsgs.length} del usuario, ${assistantMsgs.length} del asistente.`);

    if (assistantMsgs.length !== 1) {
      throw new Error(`Debounce falló: Se esperaban exactamente 1 respuesta del asistente, pero se encontraron ${assistantMsgs.length}.`);
    }

    const firstReply = String(replyMsg.content || "");
    const lowerReply = firstReply.toLowerCase();
    const asksSalsas =
      lowerReply.includes("salsa") ||
      lowerReply.includes("mora") ||
      lowerReply.includes("arequipe") ||
      lowerReply.includes("bocadillo") ||
      lowerReply.includes("suero");

    if (!asksSalsas) {
      throw new Error(`La respuesta no preguntó por las salsas de la caja surtida. Respuesta: "${firstReply}"`);
    }

    console.log(`${c.green}✅ Debounce exitoso: 3 mensajes agrupados, exactamente 1 respuesta generada.${c.reset}`);
    console.log(`${c.dim}💬 Bot: "${firstReply.slice(0, 140)}..."${c.reset}\n`);
  } catch (err) {
    console.error(`${c.red}❌ Error en PASO 2 (Debounce): ${err.message}${c.reset}\n`);
    allPassed = false;
  }

  // -------------------------------------------------------------
  // PASO 3: Test Salsas y Dirección
  // -------------------------------------------------------------
  console.log(`${c.bright}PASO 3: Test Salsas y Dirección${c.reset}`);
  console.log(`Enviando: "Con mora y arequipe para el Conjunto Puertas del Sol Torre 2 Apto 301"...`);
  try {
    const step3Start = Date.now();
    await sendWebhookMessage("Con mora y arequipe para el Conjunto Puertas del Sol Torre 2 Apto 301");
    console.log(`⏳ Esperando respuesta del bot con dirección procesada...`);

    const replyMsg = await waitForAssistantReply(step3Start, 16000);
    if (!replyMsg) {
      throw new Error("Tiempo de espera agotado sin respuesta del bot tras enviar salsas y dirección.");
    }

    const reply = String(replyMsg.content || "");
    const lower = reply.toLowerCase();

    const asksPayment =
      lower.includes("pago") ||
      lower.includes("nequi") ||
      lower.includes("bre-b") ||
      lower.includes("efectivo") ||
      lower.includes("contra entrega");

    const mentionsAddressOrAccepted =
      lower.includes("puertas del sol") ||
      lower.includes("conjunto") ||
      lower.includes("torre 2") ||
      lower.includes("anotad") ||
      lower.includes("recibid") ||
      lower.includes("perfecto") ||
      lower.includes("domicilio") ||
      lower.includes("dirección") ||
      lower.includes("direccion") ||
      asksPayment;

    const reasksAddress =
      lower.includes("cuál es tu dirección") ||
      lower.includes("cual es tu direccion") ||
      lower.includes("a qué dirección") ||
      lower.includes("a que direccion");

    if (!mentionsAddressOrAccepted) {
      throw new Error(`El bot no pareció reconocer la dirección en su respuesta: "${reply}"`);
    }

    if (reasksAddress) {
      throw new Error(`El bot cayó en bucle y volvió a pedir la dirección a pesar de haberla recibido: "${reply}"`);
    }

    if (!asksPayment) {
      throw new Error(`El bot no avanzó a pedir el medio de pago: "${reply}"`);
    }

    console.log(`${c.green}✅ Dirección y salsas reconocidas con éxito. Bot avanza al medio de pago.${c.reset}`);
    console.log(`${c.dim}💬 Bot: "${reply.slice(0, 140)}..."${c.reset}\n`);
  } catch (err) {
    console.error(`${c.red}❌ Error en PASO 3 (Salsas y Dirección): ${err.message}${c.reset}\n`);
    allPassed = false;
  }

  // -------------------------------------------------------------
  // PASO 4: Test Pre-Confirmación (No facturar antes de tiempo)
  // -------------------------------------------------------------
  console.log(`${c.bright}PASO 4: Test Pre-Confirmación (No facturar antes de tiempo)${c.reset}`);
  console.log(`Enviando: "Nequi"...`);
  try {
    const step4Start = Date.now();
    await sendWebhookMessage("Nequi");
    console.log(`⏳ Esperando resumen previo del pedido...`);

    const replyMsg = await waitForAssistantReply(step4Start, 16000);
    if (!replyMsg) {
      throw new Error("Tiempo de espera agotado sin resumen previo del bot.");
    }

    const reply = String(replyMsg.content || "");
    const lower = reply.toLowerCase();

    const hasSummaryOrOptions =
      reply.includes("1️⃣") ||
      lower.includes("resumen") ||
      lower.includes("confirmar") ||
      lower.includes("modificar");

    if (!hasSummaryOrOptions) {
      throw new Error(`El bot no presentó el resumen previo con opciones 1️⃣ y 2️⃣: "${reply}"`);
    }

    // Comprobar estrictamente en la tabla orders que NO se haya creado ningún pedido prematuro
    const ordersInDb = await querySql(
      `SELECT count(*) as c FROM orders WHERE conversation_id LIKE '%${TEST_PHONE}%'`
    );
    const orderCount = Number(ordersInDb[0]?.c ?? ordersInDb[0]?.["count(*)"] ?? 0);

    if (orderCount !== 0) {
      throw new Error(`¡FALLO CRÍTICO DE FACTURACIÓN PREMATURA! Se encontraron ${orderCount} pedidos en 'orders' antes de que el cliente enviara '1'.`);
    }

    console.log(`${c.green}✅ Pre-confirmación generada con opciones 1️⃣ y 2️⃣.${c.reset}`);
    console.log(`${c.green}✅ Verificación de integridad: Exactamente 0 pedidos en orders (no se factura antes de tiempo).${c.reset}`);
    console.log(`${c.dim}💬 Bot: "${reply.slice(0, 140)}..."${c.reset}\n`);
  } catch (err) {
    console.error(`${c.red}❌ Error en PASO 4 (Pre-Confirmación): ${err.message}${c.reset}\n`);
    allPassed = false;
  }

  // -------------------------------------------------------------
  // PASO 5: Test Confirmación Final y Factura Oficial
  // -------------------------------------------------------------
  console.log(`${c.bright}PASO 5: Test Confirmación Final y Factura Oficial${c.reset}`);
  console.log(`Enviando confirmación: "1"...`);
  try {
    const step5Start = Date.now();
    await sendWebhookMessage("1");
    console.log(`⏳ Esperando confirmación y factura en Contabilidad...`);

    const order = await waitForOrder(step5Start, 18000);
    if (!order) {
      throw new Error("Tiempo de espera agotado sin pedido registrado en 'orders'.");
    }

    const total = Number(order.total);
    const address = String(order.delivery_address || "");
    const invoiceNum = String(order.invoice_number || "");

    console.log(`📋 Pedido registrado en Turso:`);
    console.log(`   - ID:        ${order.id}`);
    console.log(`   - Total:     $${total.toLocaleString("es-CO")} COP`);
    console.log(`   - Dirección: ${address}`);
    console.log(`   - Factura:   #${invoiceNum || "Sin Factura"}`);
    console.log(`   - Estado:    ${order.status}`);

    if (total !== 42000) {
      throw new Error(`Total del pedido incorrecto. Se esperaban 42000 (36.000 caja x8 + 6.000 jugo), pero fue ${total}.`);
    }

    if (!address.toLowerCase().includes("puertas del sol")) {
      throw new Error(`La dirección guardada no contiene 'Puertas del Sol'. Dirección guardada: "${address}"`);
    }

    if (!invoiceNum || invoiceNum === "null" || invoiceNum === "undefined") {
      throw new Error(`El pedido no tiene 'invoice_number' asignado de la integración con Contabilidad.`);
    }

    console.log(`\n${c.green}✅ Confirmación exitosa: 1 único pedido creado con total $42.000 COP, dirección correcta y Factura Oficial #${invoiceNum}.${c.reset}\n`);
  } catch (err) {
    console.error(`${c.red}❌ Error en PASO 5 (Confirmación y Factura): ${err.message}${c.reset}\n`);
    allPassed = false;
  }

  // -------------------------------------------------------------
  // RESUMEN FINAL
  // -------------------------------------------------------------
  console.log(`${c.bright}${c.cyan}====================================================${c.reset}`);
  if (allPassed) {
    console.log(`${c.bright}${c.green}  🎉 ¡TODAS LAS PRUEBAS END-TO-END PASARON CON ÉXITO!${c.reset}`);
    console.log(`${c.cyan}====================================================${c.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${c.bright}${c.red}  ⚠️ AL MENOS UNA PRUEBA FALLÓ. REVISA LOS LOGS ANTERIORES.${c.reset}`);
    console.log(`${c.cyan}====================================================${c.reset}\n`);
    process.exit(1);
  }
}

run();
